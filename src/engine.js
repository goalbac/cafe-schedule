/**
 * engine.js  ―  카페 근무표 자동생성 엔진 v2
 * 4주(28일) 사이클 기반. 고정 배정 인식 SA 포함.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchedulerEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  // ── 기본 설정 ──────────────────────────────────────────────────────────────
  function defaultRuleConfig() {
    return {
      epoch: '2025-01-05',
      numEmployees: 4,
      cycleWeeks: 4,
      opensPerCycle: 7,
      offsPerCycle: 7,
      maxConsecutiveWork: 4,
      weekendOpensPerCycle: 2,
      weekendOffsPerCycle: 2,
      requireOneTwoConsecutiveOff: true,
      holidayCloserEmployees: [],
    };
  }

  // ── 날짜 유틸 ──────────────────────────────────────────────────────────────
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toDateUTC(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  }
  function fmtDate(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  // ── 사이클 인덱스 ──────────────────────────────────────────────────────────
  function getCycleIndex(epochIso, targetIso) {
    const diff = Math.round((toDateUTC(targetIso) - toDateUTC(epochIso)) / 86400000);
    return Math.floor(diff / 28);
  }
  function getCycleStart(epochIso, cycleIndex) {
    return fmtDate(addDays(toDateUTC(epochIso), cycleIndex * 28));
  }
  function getCurrentCycleIndex(epochIso) {
    return getCycleIndex(epochIso, fmtDate(new Date()));
  }

  // ── 사이클 28일 배열 ────────────────────────────────────────────────────────
  function buildCycleDays(cycleStartIso) {
    const start = toDateUTC(cycleStartIso);
    return Array.from({ length: 28 }, (_, i) => {
      const d = addDays(start, i);
      return { date: d, iso: fmtDate(d), weekday: d.getUTCDay(), week: Math.floor(i / 7) };
    });
  }

  // ── 주별 목표치 (N=4, 4주 사이클 전용) ────────────────────────────────────
  function targetOpenForWeek(empIdx, week, cfg) {
    return (week % cfg.cycleWeeks) === empIdx ? 1 : 2;
  }
  function targetOffForWeek(empIdx, week, cfg) {
    const lightOff = (empIdx + 1) % cfg.numEmployees;
    return (week % cfg.cycleWeeks) === lightOff ? 1 : 2;
  }

  // ── 난수 ───────────────────────────────────────────────────────────────────
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── 고정 배정 슬롯 배열 빌드 ──────────────────────────────────────────────
  function buildFixedSlotsArray(days, fixedAssignments, cfg) {
    return days.map(d => {
      const fix = fixedAssignments[d.iso];
      if (!fix || Object.keys(fix).length === 0) return null;
      let opener = null, offp = null;
      const closers = [];
      Object.entries(fix).forEach(([empIdx, fixData]) => {
        const e = Number(empIdx);
        const type = fixData.type === 'HOLIDAY_OFF' ? 'OFF' : fixData.type;
        if (type === 'O') opener = e;
        else if (type === 'OFF') offp = e;
        else if (type === 'C') closers.push(e);
      });
      return { opener, offp, closers };
    });
  }

  // ── 고정 배정을 고려한 주별 SA 할당량 계산 ───────────────────────────────
  // 핵심 불변식: 각 주당 합계가 반드시 7이어야 함
  // (SA는 항상 주당 7개 페어를 생성해야 assemble이 28개 원소를 만들 수 있음)
  // 고정 배정이 목표치를 초과하면 같은 주의 다른 직원에게 슬롯을 재배분
  function computeFreeQuotas(calDays, fixedSlots, cfg) {
    const N = cfg.numEmployees, W = cfg.cycleWeeks;

    // 주별·직원별 고정 배정 수
    const fixedOpen = Array.from({ length: W }, () => new Array(N).fill(0));
    const fixedOff  = Array.from({ length: W }, () => new Array(N).fill(0));
    calDays.forEach((d, idx) => {
      const fix = fixedSlots[idx];
      if (!fix) return;
      const w = Math.floor(idx / 7);
      if (fix.opener !== null) fixedOpen[w][fix.opener]++;
      if (fix.offp   !== null) fixedOff[w][fix.offp]++;
    });

    // 주별 SA 할당량: 목표 - 고정 (음수→0), 합계를 정확히 7로 맞춤
    function buildWeekQuota(w, targetFn, fixedM) {
      const counts = Array.from({ length: N }, (_, e) =>
        Math.max(0, targetFn(e, w, cfg) - fixedM[w][e]));
      let sum = counts.reduce((a, b) => a + b, 0);

      // 합 < 7: 가장 적은 직원에게 슬롯 추가 (분산 배분)
      while (sum < 7) {
        let minI = 0;
        for (let e = 1; e < N; e++) { if (counts[e] < counts[minI]) minI = e; }
        counts[minI]++; sum++;
      }
      // 합 > 7: 가장 많은 직원에서 슬롯 제거
      while (sum > 7) {
        let maxI = 0;
        for (let e = 1; e < N; e++) { if (counts[e] > counts[maxI]) maxI = e; }
        counts[maxI]--; sum--;
      }
      return counts;
    }

    const freeOpen = Array.from({ length: W }, (_, w) => buildWeekQuota(w, targetOpenForWeek, fixedOpen));
    const freeOff  = Array.from({ length: W }, (_, w) => buildWeekQuota(w, targetOffForWeek, fixedOff));

    return { freeOpen, freeOff, fixedOpen, fixedOff };
  }

  // ── 주 단위 페어 생성 (커스텀 목록) ──────────────────────────────────────
  function buildWeekPairsFromLists(openList, offList, rng) {
    if (openList.length === 0) return [];
    const len = Math.min(openList.length, offList.length);
    const ol = openList.slice(0, len);
    const fl = offList.slice(0, len);

    for (let attempt = 0; attempt < 3000; attempt++) {
      const perm = shuffle(fl.slice(), rng);
      if (perm.every((v, i) => v !== ol[i]))
        return shuffle(ol.map((o, i) => [o, perm[i]]), rng);
    }
    function bt(idx, rem, out) {
      if (idx === ol.length) return out.slice();
      for (let i = 0; i < rem.length; i++) {
        if (rem[i] !== ol[idx]) {
          const r = bt(idx + 1, rem.filter((_, j) => j !== i), out.concat(rem[i]));
          if (r) return r;
        }
      }
      return null;
    }
    const perm = bt(0, fl, []);
    if (!perm) return ol.map((o, i) => [o, fl[i % fl.length]]); // 최후 폴백
    return ol.map((o, i) => [o, perm[i]]);
  }

  function assemble(weekOrders) {
    const opener = [], offp = [];
    weekOrders.forEach(w => w.forEach(([o, f]) => { opener.push(o); offp.push(f); }));
    return { opener, offp };
  }

  // ── 고정 배정 위반 비용 ────────────────────────────────────────────────────
  function fixedCost(opener, offp, fixedSlots) {
    if (!fixedSlots) return 0;
    let c = 0;
    for (let d = 0; d < opener.length; d++) {
      const fix = fixedSlots[d];
      if (!fix) continue;
      if (fix.opener !== null && opener[d] !== fix.opener) c += 10000;
      if (fix.offp   !== null && offp[d]   !== fix.offp)  c += 10000;
      fix.closers.forEach(e => {
        if (opener[d] === e || offp[d] === e) c += 10000;
      });
    }
    return c;
  }

  // ── SA 하드 비용 ───────────────────────────────────────────────────────────
  function hardCost(opener, offp, cfg) {
    let c = 0;
    const N = cfg.numEmployees, D = opener.length;
    const wOpen = new Array(N).fill(0), wOff = new Array(N).fill(0);
    for (let d = 0; d < D; d++) {
      if (d % 7 === 0 || d % 7 === 6) { wOpen[opener[d]]++; wOff[offp[d]]++; }
    }
    for (let e = 0; e < N; e++) {
      c += Math.abs(wOpen[e] - cfg.weekendOpensPerCycle) * 100;
      c += Math.abs(wOff[e]  - cfg.weekendOffsPerCycle)  * 100;
    }
    if (cfg.requireOneTwoConsecutiveOff) {
      for (let e = 0; e < N; e++) {
        let found = false;
        for (let d = 0; d < D - 1 && !found; d++)
          if (offp[d] === e && offp[d + 1] === e) found = true;
        if (!found) c += 150;
      }
    }
    for (let e = 0; e < N; e++) {
      let streak = 0;
      for (let d = 0; d < D; d++) {
        if (offp[d] === e) streak = 0;
        else { streak++; if (streak > cfg.maxConsecutiveWork) c += 100; }
      }
    }
    return c;
  }

  // ── SA 소프트 비용 (고정 슬롯 제외) ──────────────────────────────────────
  function softCost(opener, offp, fixedSlots, calDays, cfg) {
    let s = 0;
    const hClosers  = (cfg && cfg.holidayCloserEmployees) || [];
    const holSet    = (cfg && cfg._holidaySet) || new Set();

    for (let d = 0; d < opener.length - 1; d++) {
      // 고정 오픈 슬롯은 변경 불가 → 소프트 위반 계산 제외
      const nextFixed = fixedSlots && fixedSlots[d + 1] && fixedSlots[d + 1].offp !== null;
      if (!nextFixed && offp[d + 1] !== opener[d]) s++;
      if (d % 7 === 6 && opener[d] !== opener[d + 1]) s++;
    }

    // 주말·공휴일 마감 선호 직원이 C가 아닐 때 페널티
    if (hClosers.length > 0 && calDays) {
      for (let d = 0; d < calDays.length; d++) {
        const wd = calDays[d].weekday;
        const isWkdOrHol = wd === 0 || wd === 6 || holSet.has(calDays[d].iso);
        if (!isWkdOrHol) continue;
        // 선호 직원 중 누군가가 C(마감)이면 OK
        const anyCloser = hClosers.some(e => e !== opener[d] && e !== offp[d]);
        if (!anyCloser) s += 2;
      }
    }

    return s;
  }

  // ── 메인 생성 함수 ─────────────────────────────────────────────────────────
  function generateSchedule(cycleStartIso, cfg, fixedAssignments, seed) {
    cfg = Object.assign(defaultRuleConfig(), cfg || {});
    // 공휴일 Set을 softCost에서 참조할 수 있도록 cfg에 주입
    cfg._holidaySet = new Set((cfg.holidays || []).map(h => h.iso || h));
    const calDays   = buildCycleDays(cycleStartIso);
    const fixedSlots = buildFixedSlotsArray(calDays, fixedAssignments || {}, cfg);
    const rng        = mulberry32(seed == null ? Date.now() % 2147483647 : seed);
    const W          = cfg.cycleWeeks;

    // 고정 배정을 반영한 자유 할당량 계산
    const { freeOpen, freeOff } = computeFreeQuotas(calDays, fixedSlots, cfg);

    let bestWeekOrders = null, bestCost = Infinity;
    const RESTARTS = 25, ITERS = 6000;

    const totalCost = (opener, offp) =>
      hardCost(opener, offp, cfg) + fixedCost(opener, offp, fixedSlots) + softCost(opener, offp, fixedSlots, calDays, cfg);

    for (let r = 0; r < RESTARTS; r++) {
      // 각 주별 자유 할당량으로 페어 생성
      const weekOrders = Array.from({ length: W }, (_, w) => {
        const openList = [], offList = [];
        for (let e = 0; e < cfg.numEmployees; e++) {
          for (let i = 0; i < freeOpen[w][e]; i++) openList.push(e);
          for (let i = 0; i < freeOff[w][e]; i++) offList.push(e);
        }
        // 자유 슬롯 수가 다를 때 min 기준 페어 생성
        // 나머지 슬롯은 fixedCost 페널티로 SA가 조정
        const pairCount = Math.min(openList.length, offList.length);
        return buildWeekPairsFromLists(openList.slice(0, pairCount), offList.slice(0, pairCount), rng);
      });

      // 고정 슬롯 적용: 페어 위치를 고정 일에 맞게 초기 배치
      // (SA가 스왑으로 추가 최적화)
      let { opener, offp } = assemble(weekOrders);
      let cur = totalCost(opener, offp);
      let localBest = weekOrders.map(w => w.slice()), localBestCost = cur;

      for (let it = 0; it < ITERS; it++) {
        const T = Math.max(0.02, 1.5 * (1 - it / ITERS));
        const w = Math.floor(rng() * W);
        const week = weekOrders[w];
        if (week.length < 2) continue;
        const i = Math.floor(rng() * week.length);
        let j = Math.floor(rng() * week.length);
        while (j === i) j = Math.floor(rng() * week.length);
        [week[i], week[j]] = [week[j], week[i]];

        const a  = assemble(weekOrders);
        const nc = totalCost(a.opener, a.offp);
        const delta = nc - cur;
        if (delta <= 0 || rng() < Math.exp(-delta / T)) {
          cur = nc;
          if (cur < localBestCost) { localBestCost = cur; localBest = weekOrders.map(w => w.slice()); }
        } else { [week[i], week[j]] = [week[j], week[i]]; }
        if (localBestCost === 0) break;
      }
      if (localBestCost < bestCost) { bestCost = localBestCost; bestWeekOrders = localBest; }
      if (bestCost === 0) break;
    }

    const { opener, offp } = assemble(bestWeekOrders);
    const days = calDays.map((cd, idx) => {
      const assignments = {};
      for (let e = 0; e < cfg.numEmployees; e++) {
        assignments[e] = (e === opener[idx]) ? 'O' : (e === offp[idx]) ? 'OFF' : 'C';
      }
      return Object.assign({}, cd, { assignments });
    });

    // 고정 배정 후처리 (SA 수렴 실패분 보정)
    const overrideViolations = applyFixedAssignments(days, fixedAssignments || {}, cfg);
    // 사이클 총량 균형 보정 (고정 배정으로 인한 카운트 불균형 해소)
    balanceCycleCounts(days, fixedAssignments || {}, cfg);
    const report = validateSchedule(days, cfg, fixedAssignments || {});
    report.overrideViolations = overrideViolations;
    return { cycleStartIso, cfg, days, report };
  }

  // ── 사이클 총량 균형 보정 ──────────────────────────────────────────────────
  // applyFixedAssignments 후 직원별 O/OFF/C 횟수가 목표(7/7/14)와 다를 경우
  // 같은 날 두 직원 간 같은-구성 스왑(OFF↔C, O↔C)으로 보정한다.
  // 스왑 조건: 양쪽 모두 고정 배정이 아닌 날만 허용 → 일별 구성 자동 유지.
  function balanceCycleCounts(days, fixedAssignments, cfg) {
    const N = cfg.numEmployees;
    const TARGET = { O: 7, OFF: 7 };

    function counts(type) {
      return Array.from({ length: N }, (_, e) =>
        days.reduce((s, d) => s + (d.assignments[e] === type ? 1 : 0), 0));
    }

    function isFixed(dayIso, e) {
      const f = fixedAssignments[dayIso];
      return f && f[e] != null;
    }

    // type='OFF' 또는 'O': over인 직원의 해당 타입 → C, under인 직원의 C → 해당 타입
    function balanceType(type) {
      for (let iter = 0; iter < 200; iter++) {
        const cnts = counts(type);
        const maxV = Math.max(...cnts), minV = Math.min(...cnts);
        if (maxV <= TARGET[type] && minV >= TARGET[type]) break;
        // over/under 직원 선택 (목표 초과/미달 중 가장 심한 것)
        const overE  = cnts.indexOf(maxV);
        const underE = cnts.indexOf(minV);
        if (overE === underE || maxV === minV) break;

        let swapped = false;
        for (let d = 0; d < days.length; d++) {
          const a   = days[d].assignments;
          const iso = days[d].iso;
          if (a[overE] === type && a[underE] === 'C'
              && !isFixed(iso, overE) && !isFixed(iso, underE)) {
            a[overE]  = 'C';
            a[underE] = type;
            swapped = true;
            break;
          }
        }
        if (!swapped) break;
      }
    }

    balanceType('OFF');
    balanceType('O');
  }

  // ── 고정 배정 후처리 ────────────────────────────────────────────────────────
  // SA 수렴 실패 시 강제 적용 후 1O+1OFF+2C 구성을 복구
  function applyFixedAssignments(days, fixedAssignments, cfg) {
    const violations = [];
    days.forEach(day => {
      const dayFixed = fixedAssignments[day.iso];
      if (!dayFixed) return;

      // 1단계: 고정 배정 강제 적용
      Object.entries(dayFixed).forEach(([empIdx, fix]) => {
        day.assignments[Number(empIdx)] = (fix.type === 'HOLIDAY_OFF') ? 'OFF' : fix.type;
      });

      // 2단계: 1O+1OFF+2C 구성 복구 (고정되지 않은 직원만 조정)
      const fixedEmps = new Set(Object.keys(dayFixed).map(Number));
      let opens = 0, offs = 0;
      for (let e = 0; e < cfg.numEmployees; e++) {
        if (day.assignments[e] === 'O') opens++;
        else if (day.assignments[e] === 'OFF') offs++;
      }
      for (let e = 0; e < cfg.numEmployees && offs > 1; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'OFF') { day.assignments[e] = 'C'; offs--; }
      }
      for (let e = 0; e < cfg.numEmployees && opens > 1; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'O') { day.assignments[e] = 'C'; opens--; }
      }
      for (let e = 0; e < cfg.numEmployees && offs === 0; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'C') { day.assignments[e] = 'OFF'; offs++; }
      }
      for (let e = 0; e < cfg.numEmployees && opens === 0; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'C') { day.assignments[e] = 'O'; opens++; }
      }

      let o = 0, f = 0, c = 0;
      for (let e = 0; e < cfg.numEmployees; e++) {
        const v = day.assignments[e];
        if (v === 'O') o++; else if (v === 'OFF') f++; else c++;
      }
      if (o !== 1 || f !== 1 || c !== cfg.numEmployees - 2)
        violations.push({ iso: day.iso, opens: o, offs: f, closes: c });
    });
    return violations;
  }

  // ── 고정 배정 사전 검증 ────────────────────────────────────────────────────
  // 생성 전 호출: 불가능하거나 문제 있는 고정 배정 탐지
  function validateFixedRequests(fixedAssignments, cfg, cycleStartIso) {
    const warnings = [];
    const calDays  = buildCycleDays(cycleStartIso);
    const fixedSlots = buildFixedSlotsArray(calDays, fixedAssignments || {}, cfg);
    const N = cfg.numEmployees, W = cfg.cycleWeeks;

    // 주별 고정 수 집계
    const fixedOpen = Array.from({ length: W }, () => new Array(N).fill(0));
    const fixedOff  = Array.from({ length: W }, () => new Array(N).fill(0));
    calDays.forEach((d, idx) => {
      const fix = fixedSlots[idx];
      if (!fix) return;
      const w = Math.floor(idx / 7);
      if (fix.opener !== null) fixedOpen[w][fix.opener]++;
      if (fix.offp   !== null) fixedOff[w][fix.offp]++;
    });

    // 같은 날 2명 이상 동일 역할 고정 검사
    calDays.forEach((d, idx) => {
      const fix = fixedSlots[idx];
      if (!fix) return;
      if (fix.opener !== null && fix.closers.includes(fix.opener))
        warnings.push({ type: 'conflict', iso: d.iso, msg: `${d.iso}: 동일 직원이 오픈+마감으로 중복 고정` });
      if (fix.offp !== null && fix.closers.includes(fix.offp))
        warnings.push({ type: 'conflict', iso: d.iso, msg: `${d.iso}: 동일 직원이 휴무+마감으로 중복 고정` });
      if (fix.opener !== null && fix.offp !== null && fix.opener === fix.offp)
        warnings.push({ type: 'conflict', iso: d.iso, msg: `${d.iso}: 동일 직원이 오픈+휴무로 중복 고정` });
    });

    // 주별 초과 할당량 경고
    for (let e = 0; e < N; e++) {
      for (let w = 0; w < W; w++) {
        if (fixedOff[w][e] > targetOffForWeek(e, w, cfg)) {
          warnings.push({
            type: 'quota',
            iso: null,
            msg: `${w + 1}주차 직원${e}(${calDays[w * 7].iso} 주): 휴무 고정 ${fixedOff[w][e]}회 > 주 목표 ${targetOffForWeek(e, w, cfg)}회 — 다른 주 휴무 횟수가 자동 조정됩니다`,
          });
        }
        if (fixedOpen[w][e] > targetOpenForWeek(e, w, cfg)) {
          warnings.push({
            type: 'quota',
            iso: null,
            msg: `${w + 1}주차 직원${e}(${calDays[w * 7].iso} 주): 오픈 고정 ${fixedOpen[w][e]}회 > 주 목표 ${targetOpenForWeek(e, w, cfg)}회 — 다른 주 오픈 횟수가 자동 조정됩니다`,
          });
        }
      }
    }

    // 사이클 총 고정 수가 7을 초과하는 직원 경고
    for (let e = 0; e < N; e++) {
      const totalFixedOff  = fixedOff.reduce((sum, row) => sum + row[e], 0);
      const totalFixedOpen = fixedOpen.reduce((sum, row) => sum + row[e], 0);
      if (totalFixedOff > cfg.offsPerCycle)
        warnings.push({ type: 'overflow', iso: null, msg: `직원${e}: 사이클 전체 휴무 고정 ${totalFixedOff}회 > 목표 ${cfg.offsPerCycle}회 — 조건 달성 불가` });
      if (totalFixedOpen > cfg.opensPerCycle)
        warnings.push({ type: 'overflow', iso: null, msg: `직원${e}: 사이클 전체 오픈 고정 ${totalFixedOpen}회 > 목표 ${cfg.opensPerCycle}회 — 조건 달성 불가` });
    }

    return warnings;
  }

  // ── 검증 ───────────────────────────────────────────────────────────────────
  function validateSchedule(days, cfg, fixedAssignments, holidays) {
    cfg = Object.assign(defaultRuleConfig(), cfg || {});
    fixedAssignments = fixedAssignments || {};
    holidays = holidays || [];
    const N = cfg.numEmployees, D = days.length;

    const holidaySet = new Set(holidays.map(h => h.iso));

    const dayChecks = days.map(d => {
      let opens = 0, offs = 0, closes = 0;
      for (let e = 0; e < N; e++) {
        const v = d.assignments[e];
        if (v === 'O') opens++; else if (v === 'OFF') offs++; else closes++;
      }
      const ok = opens === 1 && offs === 1 && closes === N - 2;
      return { iso: d.iso, opens, offs, closes, ok };
    });

    const perEmployee = [];
    for (let e = 0; e < N; e++) {
      let opens = 0, offs = 0, closes = 0;
      let weekendOpen = 0, weekendOff = 0;
      let maxStreak = 0, streak = 0;
      const consecOffRuns = [];
      let runLen = 0, runStart = -1;
      const weeklyOpens = [0, 0, 0, 0], weeklyOffs = [0, 0, 0, 0];

      for (let d = 0; d < D; d++) {
        const v = days[d].assignments[e];
        const wd = d % 7, w = Math.floor(d / 7);
        if (v === 'O') { opens++; weeklyOpens[w]++; }
        else if (v === 'OFF') { offs++; weeklyOffs[w]++; }
        else closes++;
        if (wd === 0 || wd === 6) {
          if (v === 'O') weekendOpen++;
          if (v === 'OFF') weekendOff++;
        }
        if (v === 'OFF') {
          streak = 0;
          if (runLen === 0) { runStart = d; runLen = 1; } else runLen++;
        } else {
          streak++; maxStreak = Math.max(maxStreak, streak);
          if (runLen > 0) { consecOffRuns.push({ start: runStart, len: runLen }); runLen = 0; }
        }
      }
      if (runLen > 0) consecOffRuns.push({ start: runStart, len: runLen });
      const twoConsecCount = consecOffRuns.filter(r => r.len >= 2).length;

      const sortedO = weeklyOpens.slice().sort((a, b) => a - b);
      const weeklyOpenDistOk = sortedO[0] === 1 && sortedO[1] === 2 && sortedO[2] === 2 && sortedO[3] === 2;
      const sortedF = weeklyOffs.slice().sort((a, b) => a - b);
      const weeklyOffDistOk = sortedF[0] === 1 && sortedF[1] === 2 && sortedF[2] === 2 && sortedF[3] === 2;
      const lightOpenWeek = weeklyOpens.indexOf(Math.min(...weeklyOpens));
      const lightOffWeek  = weeklyOffs.indexOf(Math.min(...weeklyOffs));
      const separateWeeksOk = weeklyOpenDistOk && weeklyOffDistOk && lightOpenWeek !== lightOffWeek;

      // 고정 배정으로 인한 주별 분포 위반 여부 판단
      const fixedWeeklyOpens = [0,0,0,0], fixedWeeklyOffs = [0,0,0,0];
      for (let d = 0; d < D; d++) {
        const w = Math.floor(d / 7);
        const f = fixedAssignments[days[d].iso];
        if (f && f[e] != null) {
          const t = f[e].type;
          if (t === 'O') fixedWeeklyOpens[w]++;
          if (t === 'OFF' || t === 'HOLIDAY_OFF') fixedWeeklyOffs[w]++;
        }
      }
      const weeklyOpenDistFixedCause = !weeklyOpenDistOk && weeklyOpens.some((cnt, w) =>
        cnt !== targetOpenForWeek(e, w, cfg) && fixedWeeklyOpens[w] > 0);
      const weeklyOffDistFixedCause = !weeklyOffDistOk && weeklyOffs.some((cnt, w) =>
        cnt !== targetOffForWeek(e, w, cfg) && fixedWeeklyOffs[w] > 0);

      const closesTarget = cfg.cycleWeeks * 7 - cfg.opensPerCycle - cfg.offsPerCycle;
      perEmployee.push({
        employeeIndex: e,
        opens, offs, closes,
        opensTarget: cfg.opensPerCycle,
        offsTarget: cfg.offsPerCycle,
        closesTarget,
        weekendOpen, weekendOff,
        weekendOpenTarget: cfg.weekendOpensPerCycle,
        weekendOffTarget: cfg.weekendOffsPerCycle,
        maxStreak, maxStreakOk: maxStreak <= cfg.maxConsecutiveWork,
        twoConsecCount, twoConsecOk: !cfg.requireOneTwoConsecutiveOff || twoConsecCount >= 1,
        weeklyOpens, weeklyOffs,
        weeklyOpenDistOk, weeklyOffDistOk,
        weeklyOpenDistFixedCause, weeklyOffDistFixedCause,
        lightOpenWeek, lightOffWeek, separateWeeksOk,
      });
    }

    let openNextDayViolations = 0;
    for (let d = 0; d < D - 1; d++) {
      for (let e = 0; e < N; e++) {
        if (days[d].assignments[e] === 'O' && days[d + 1].assignments[e] !== 'OFF')
          openNextDayViolations++;
      }
    }

    let weekendSameOpenerViolations = 0, weekendPairs = 0;
    for (let d = 0; d < D - 1; d++) {
      if (days[d].weekday === 6 && days[d + 1].weekday === 0) {
        weekendPairs++;
        let o1 = -1, o2 = -1;
        for (let e = 0; e < N; e++) {
          if (days[d].assignments[e] === 'O') o1 = e;
          if (days[d + 1].assignments[e] === 'O') o2 = e;
        }
        if (o1 !== o2) weekendSameOpenerViolations++;
      }
    }

    let holidayCloserViolations = 0, holidayCloserTotal = 0;
    const hClosers = cfg.holidayCloserEmployees || [];
    if (hClosers.length > 0) {
      days.forEach(d => {
        const isWkdOrHol = d.weekday === 0 || d.weekday === 6 || holidaySet.has(d.iso);
        if (!isWkdOrHol) return;
        holidayCloserTotal++;
        const anyCloser = hClosers.some(e => d.assignments[e] === 'C');
        if (!anyCloser) holidayCloserViolations++;
      });
    }

    const hardOk = dayChecks.every(d => d.ok) && perEmployee.every(pe =>
      pe.opens === pe.opensTarget && pe.offs === pe.offsTarget &&
      pe.weekendOpen === pe.weekendOpenTarget && pe.weekendOff === pe.weekendOffTarget &&
      pe.maxStreakOk && pe.twoConsecOk && pe.weeklyOpenDistOk && pe.weeklyOffDistOk && pe.separateWeeksOk
    );

    return {
      dayChecks,
      perEmployee,
      cycles: [{ cycleIndex: 0, dayStart: 0, dayEnd: D, perEmployee }],
      softResults: {
        openNextDayOff: { violations: openNextDayViolations },
        weekendSameOpener: { violations: weekendSameOpenerViolations, total: weekendPairs },
        holidayCloser: { violations: holidayCloserViolations, total: holidayCloserTotal },
      },
      overrideViolations: [],
      allHardOk: hardOk,
      allOk: hardOk,
    };
  }

  return {
    WEEKDAY_LABELS,
    defaultRuleConfig,
    buildCycleDays,
    getCycleIndex,
    getCycleStart,
    getCurrentCycleIndex,
    generateSchedule,
    validateSchedule,
    validateFixedRequests,
    applyFixedAssignments,
  };
});
