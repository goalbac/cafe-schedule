/**
 * engine.js  ―  카페 근무표 자동생성 엔진 v2
 * 4주(28일) 사이클 기반. 고정배정 후처리 오버라이드 포함.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchedulerEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  // ── 기본 설정 (config.js DEFAULT_CONFIG 와 동일 구조) ──────────────────
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

  // ── 날짜 유틸 ──────────────────────────────────────────────────────────
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

  // ── 사이클 인덱스 ──────────────────────────────────────────────────────
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

  // ── 사이클 28일 배열 ────────────────────────────────────────────────────
  function buildCycleDays(cycleStartIso) {
    const start = toDateUTC(cycleStartIso);
    return Array.from({ length: 28 }, (_, i) => {
      const d = addDays(start, i);
      return { date: d, iso: fmtDate(d), weekday: d.getUTCDay(), week: Math.floor(i / 7) };
    });
  }

  // ── 주별 목표치 (N=4, 4주 사이클 전용) ────────────────────────────────
  function targetOpenForWeek(empIdx, week, cfg) {
    return (week % cfg.cycleWeeks) === empIdx ? 1 : 2;
  }
  function targetOffForWeek(empIdx, week, cfg) {
    const lightOff = (empIdx + 1) % cfg.numEmployees;
    return (week % cfg.cycleWeeks) === lightOff ? 1 : 2;
  }

  // ── 난수 ───────────────────────────────────────────────────────────────
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

  // ── 주 단위 (오픈자, 휴무자) 쌍 생성 ──────────────────────────────────
  function buildWeekPairs(week, cfg, rng) {
    const openList = [], offList = [];
    for (let e = 0; e < cfg.numEmployees; e++) {
      for (let i = 0; i < targetOpenForWeek(e, week, cfg); i++) openList.push(e);
      for (let i = 0; i < targetOffForWeek(e, week, cfg); i++) offList.push(e);
    }
    for (let attempt = 0; attempt < 3000; attempt++) {
      const perm = shuffle(offList.slice(), rng);
      if (perm.every((v, i) => v !== openList[i]))
        return shuffle(openList.map((o, i) => [o, perm[i]]), rng);
    }
    // 백트래킹 폴백
    function bt(idx, rem, out) {
      if (idx === openList.length) return out.slice();
      for (let i = 0; i < rem.length; i++) {
        if (rem[i] !== openList[idx]) {
          const r = bt(idx + 1, rem.filter((_, j) => j !== i), out.concat(rem[i]));
          if (r) return r;
        }
      }
      return null;
    }
    const perm = bt(0, offList, []);
    if (!perm) throw new Error('주 단위 오픈/휴무 조합 생성 실패');
    return openList.map((o, i) => [o, perm[i]]);
  }

  function assemble(weekOrders) {
    const opener = [], offp = [];
    weekOrders.forEach(w => w.forEach(([o, f]) => { opener.push(o); offp.push(f); }));
    return { opener, offp };
  }

  // ── 고정 배정 슬롯 배열 빌드 ──────────────────────────────────────────
  // days: buildCycleDays() 결과, fixedAssignments: storageData.fixedAssignments
  // 반환: 28개 요소 배열. 각 요소 { opener:empIdx|null, offp:empIdx|null, closers:empIdx[] } | null
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

  // ── 고정 배정 위반 비용 (SA 내부에서 사용) ────────────────────────────
  function fixedCost(opener, offp, fixedSlots) {
    if (!fixedSlots) return 0;
    let c = 0;
    for (let d = 0; d < opener.length; d++) {
      const fix = fixedSlots[d];
      if (!fix) continue;
      if (fix.opener !== null && opener[d] !== fix.opener) c += 10000;
      if (fix.offp  !== null && offp[d]  !== fix.offp)  c += 10000;
      fix.closers.forEach(e => {
        if (opener[d] === e || offp[d] === e) c += 10000;
      });
    }
    return c;
  }

  // ── SA 비용 함수 ───────────────────────────────────────────────────────
  function hardCost(opener, offp, cfg) {
    let c = 0;
    const N = cfg.numEmployees, D = opener.length;
    const wOpen = new Array(N).fill(0), wOff = new Array(N).fill(0);
    for (let d = 0; d < D; d++) {
      if (d % 7 === 0 || d % 7 === 6) { wOpen[opener[d]]++; wOff[offp[d]]++; }
    }
    for (let e = 0; e < N; e++) {
      c += Math.abs(wOpen[e] - cfg.weekendOpensPerCycle) * 100;
      c += Math.abs(wOff[e] - cfg.weekendOffsPerCycle) * 100;
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

  function softCost(opener, offp) {
    let s = 0;
    for (let d = 0; d < opener.length - 1; d++) {
      if (offp[d + 1] !== opener[d]) s++;           // 오픈 다음날 휴무
      if (d % 7 === 6 && opener[d] !== opener[d + 1]) s++; // 토→일 오픈 동일인
    }
    return s;
  }

  // ── 메인 생성 함수 ─────────────────────────────────────────────────────
  function generateSchedule(cycleStartIso, cfg, fixedAssignments, seed) {
    cfg = Object.assign(defaultRuleConfig(), cfg || {});
    const calDays = buildCycleDays(cycleStartIso);
    const fixedSlots = buildFixedSlotsArray(calDays, fixedAssignments || {}, cfg);
    const rng = mulberry32(seed == null ? Date.now() % 2147483647 : seed);

    let bestWeekOrders = null, bestCost = Infinity;
    const RESTARTS = 25, ITERS = 6000;

    const totalCost = (opener, offp) =>
      hardCost(opener, offp, cfg) + fixedCost(opener, offp, fixedSlots) + softCost(opener, offp);

    for (let r = 0; r < RESTARTS; r++) {
      const weekOrders = Array.from({ length: cfg.cycleWeeks }, (_, w) =>
        buildWeekPairs(w, cfg, rng));
      let { opener, offp } = assemble(weekOrders);
      let cur = totalCost(opener, offp);
      let localBest = weekOrders.map(w => w.slice()), localBestCost = cur;

      for (let it = 0; it < ITERS; it++) {
        const T = Math.max(0.02, 1.5 * (1 - it / ITERS));
        const w = Math.floor(rng() * cfg.cycleWeeks);
        const week = weekOrders[w];
        const i = Math.floor(rng() * 7);
        let j = Math.floor(rng() * 7);
        while (j === i) j = Math.floor(rng() * 7);
        [week[i], week[j]] = [week[j], week[i]];

        const a = assemble(weekOrders);
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

    // 고정 배정 후처리 오버라이드
    const overrideViolations = applyFixedAssignments(days, fixedAssignments || {}, cfg);
    const report = validateSchedule(days, cfg, fixedAssignments || {});
    report.overrideViolations = overrideViolations;
    return { cycleStartIso, cfg, days, report };
  }

  // ── 고정 배정 후처리 ────────────────────────────────────────────────────
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
      // 초과 OFF → C로 변경
      for (let e = 0; e < cfg.numEmployees && offs > 1; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'OFF') { day.assignments[e] = 'C'; offs--; }
      }
      // 초과 O → C로 변경
      for (let e = 0; e < cfg.numEmployees && opens > 1; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'O') { day.assignments[e] = 'C'; opens--; }
      }
      // OFF 누락 → 비고정 C를 OFF로
      for (let e = 0; e < cfg.numEmployees && offs === 0; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'C') { day.assignments[e] = 'OFF'; offs++; }
      }
      // O 누락 → 비고정 C를 O로
      for (let e = 0; e < cfg.numEmployees && opens === 0; e++) {
        if (!fixedEmps.has(e) && day.assignments[e] === 'C') { day.assignments[e] = 'O'; opens++; }
      }

      // 3단계: 여전히 구성이 맞지 않으면 위반 기록
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

  // ── 검증 ───────────────────────────────────────────────────────────────
  function validateSchedule(days, cfg, fixedAssignments, holidays) {
    cfg = Object.assign(defaultRuleConfig(), cfg || {});
    fixedAssignments = fixedAssignments || {};
    holidays = holidays || [];
    const N = cfg.numEmployees, D = days.length;

    // 공휴일 Set
    const holidaySet = new Set(holidays.map(h => h.iso));

    // 일별 검증
    const dayChecks = days.map(d => {
      let opens = 0, offs = 0, closes = 0;
      for (let e = 0; e < N; e++) {
        const v = d.assignments[e];
        if (v === 'O') opens++; else if (v === 'OFF') offs++; else closes++;
      }
      const ok = opens === 1 && offs === 1 && closes === N - 2;
      return { iso: d.iso, opens, offs, closes, ok };
    });

    // 직원별 집계
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

      // 주별 분포 검사
      const sortedO = weeklyOpens.slice().sort((a, b) => a - b);
      const weeklyOpenDistOk = sortedO[0] === 1 && sortedO[1] === 2 && sortedO[2] === 2 && sortedO[3] === 2;
      const sortedF = weeklyOffs.slice().sort((a, b) => a - b);
      const weeklyOffDistOk = sortedF[0] === 1 && sortedF[1] === 2 && sortedF[2] === 2 && sortedF[3] === 2;
      const lightOpenWeek = weeklyOpens.indexOf(Math.min(...weeklyOpens));
      const lightOffWeek = weeklyOffs.indexOf(Math.min(...weeklyOffs));
      const separateWeeksOk = weeklyOpenDistOk && weeklyOffDistOk && lightOpenWeek !== lightOffWeek;

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
        lightOpenWeek, lightOffWeek, separateWeeksOk,
      });
    }

    // 소프트 조건 집계
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
        if (holidaySet.has(d.iso)) {
          holidayCloserTotal++;
          const anyCloser = hClosers.some(e => d.assignments[e] === 'C');
          if (!anyCloser) holidayCloserViolations++;
        }
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
    applyFixedAssignments,
  };
});
