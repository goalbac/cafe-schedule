/**
 * app.js  ―  카페 근무표 v2
 */
(function () {
  'use strict';

  // ── 상태 ─────────────────────────────────────────────────────────────────
  let storageData       = null;
  let currentCycleStart = null;
  let cycleIndex        = 0;
  let cycleData         = null;
  let ctxTarget         = null;
  let saveTimer         = null;
  let selectedWeeks     = new Set([0, 1, 2, 3]);

  // ── DOM ───────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const statusText        = $('statusText');
  const reqCycleLabel     = $('reqCycleLabel');
  const prevCycleBtn      = $('prevCycleBtn');
  const nextCycleBtn      = $('nextCycleBtn');
  const todayCycleBtn     = $('todayCycleBtn');
  const cycleLabel        = $('cycleLabel');
  const cycleDateRange    = $('cycleDateRange');
  const epochInput        = $('epochInput');
  const generateBtn       = $('generateBtn');
  const empInputs         = Array.from(document.querySelectorAll('.emp-input'));
  const starBtns          = Array.from(document.querySelectorAll('.star-btn'));
  const scheduleContainer = $('scheduleContainer');
  const contextMenu       = $('contextMenu');
  const hardConditionsEl  = $('hardConditions');
  const softConditionsEl  = $('softConditions');
  const hardOverallEl     = $('hardOverall');
  const softOverallEl     = $('softOverall');
  const holidayListEl     = $('holidayList');
  const holidayDateInput  = $('holidayDateInput');
  const holidayNameInput  = $('holidayNameInput');
  const addHolidayBtn     = $('addHolidayBtn');
  const exportImageBtn    = $('exportImageBtn');
  const exportCsvBtn      = $('exportCsvBtn');
  const exportXlsxBtn     = $('exportXlsxBtn');
  const exportJsonBtn     = $('exportJsonBtn');
  const importJsonBtn     = $('importJsonBtn');
  const importJsonFile    = $('importJsonFile');
  const leaveEmpSelect    = $('leaveEmpSelect');
  const leaveDateInput    = $('leaveDateInput');
  const leaveTypeSelect   = $('leaveTypeSelect');
  const addLeaveBtn       = $('addLeaveBtn');
  const leaveListEl       = $('leaveList');
  const requestBadge      = $('requestBadge');
  const connectFileBtn    = $('connectFileBtn');
  const createFileBtn     = $('createFileBtn');
  const disconnectFileBtn = $('disconnectFileBtn');
  const fileStatusBadge   = $('fileStatusBadge');
  const fileStatusArea    = $('fileStatusArea');

  // ── 설정 접근자 ───────────────────────────────────────────────────────────
  function getCfg() {
    return Object.assign({}, AppConfig.DEFAULT_CONFIG, storageData.config || {});
  }
  function getHolidays() {
    return storageData.holidays != null ? storageData.holidays : AppConfig.DEFAULT_HOLIDAYS;
  }
  function getHolidaySet() { return new Set(getHolidays().map(h => h.iso)); }
  function getHolidayMap() {
    const m = {};
    getHolidays().forEach(h => { m[h.iso] = h.name; });
    return m;
  }
  function currentEmployeeNames() {
    return empInputs.map(el => el.value.trim() || el.placeholder);
  }

  function setStatus(text) { statusText.textContent = text; }

  // ── 사이클 UI ─────────────────────────────────────────────────────────────
  function updateCycleUI() {
    if (!currentCycleStart) return;
    const [y, m, d] = currentCycleStart.split('-').map(Number);
    const start  = new Date(Date.UTC(y, m - 1, d));
    const end    = new Date(start.getTime() + 27 * 86400000);
    const endIso = `${end.getUTCFullYear()}-${String(end.getUTCMonth()+1).padStart(2,'0')}-${String(end.getUTCDate()).padStart(2,'0')}`;
    cycleLabel.textContent     = `사이클 #${cycleIndex + 1}`;
    cycleDateRange.textContent = `${currentCycleStart} ~ ${endIso}`;
    epochInput.value           = getCfg().epoch;
    generateBtn.textContent    = `사이클 #${cycleIndex + 1} 일정 생성`;
  }

  // ── 초기화 ────────────────────────────────────────────────────────────────
  // ── 파일 저장 UI ──────────────────────────────────────────────────────────
  function renderFileStatus() {
    const name = Storage.getFileName();
    const pending = Storage.getPendingHandle();
    if (name) {
      fileStatusBadge.textContent = '연결됨';
      fileStatusBadge.className   = 'file-badge file-badge--on';
      fileStatusArea.innerHTML    = `<p class="file-status-ok">📁 <b>${name}</b> 에 자동 저장 중</p>`;
      connectFileBtn.style.display    = '';
      createFileBtn.style.display     = '';
      disconnectFileBtn.style.display = '';
    } else if (pending) {
      fileStatusBadge.textContent = '복원 필요';
      fileStatusBadge.className   = 'file-badge file-badge--pending';
      fileStatusArea.innerHTML    = `<p class="file-status-warn">이전에 연결한 파일이 있습니다.<br>아래 버튼을 눌러 연결을 복원하세요.</p>
        <button id="restoreFileBtn" class="btn btn-sm btn-primary">🔄 연결 복원</button>`;
      connectFileBtn.style.display    = '';
      createFileBtn.style.display     = '';
      disconnectFileBtn.style.display = '';
      document.getElementById('restoreFileBtn').addEventListener('click', async () => {
        const ok = await Storage.requestPendingPermission();
        if (ok) {
          // 파일에서 데이터 다시 로드
          const fileData = await Storage.loadAll();
          if (fileData && fileData.cycles) {
            storageData = fileData;
            await Storage.saveAll(storageData);
          }
        }
        renderFileStatus();
      });
    } else {
      fileStatusBadge.textContent = '미연결';
      fileStatusBadge.className   = 'file-badge file-badge--off';
      fileStatusArea.innerHTML    = `<p class="file-status-off">현재 브라우저(로컬스토리지)에 저장 중입니다.<br>파일에 연결하면 폴더 공유 시 데이터도 함께 전달됩니다.</p>`;
      connectFileBtn.style.display    = '';
      createFileBtn.style.display     = '';
      disconnectFileBtn.style.display = 'none';
    }
  }

  async function onConnectFile() {
    const ok = await Storage.connectFile();
    if (!ok) return;
    // 연결 후 현재 데이터를 파일에 저장
    await Storage.saveAll(storageData);
    renderFileStatus();
    setStatus(`파일 연결됨: ${Storage.getFileName()}`);
  }

  async function onCreateFile() {
    const ok = await Storage.createAndConnectFile();
    if (!ok) return;
    await Storage.saveAll(storageData);
    renderFileStatus();
    setStatus(`파일 생성 및 연결됨: ${Storage.getFileName()}`);
  }

  async function onDisconnectFile() {
    if (!confirm('파일 연결을 해제하시겠습니까?\n데이터는 브라우저(로컬스토리지)에 계속 저장됩니다.')) return;
    await Storage.disconnectFile();
    renderFileStatus();
    setStatus('파일 연결 해제됨. 브라우저 저장으로 전환됩니다.');
  }

  // ── 앱 초기화 ─────────────────────────────────────────────────────────────
  async function init() {
    // 파일 핸들 복원 시도 (사용자 제스처 없이 가능한 경우만)
    await Storage.tryRestoreFileHandle();
    storageData = await Storage.loadAll();
    empInputs.forEach((el, i) => { el.value = storageData.employees[i] || ''; });

    const cfg = getCfg();
    starBtns.forEach(btn => {
      const idx = Number(btn.dataset.idx);
      const on  = cfg.holidayCloserEmployees.includes(idx);
      btn.textContent = on ? '⭐' : '☆';
      btn.classList.toggle('starred', on);
    });

    cycleIndex = SchedulerEngine.getCurrentCycleIndex(cfg.epoch);
    if (storageData.lastCycleStart) {
      cycleIndex        = SchedulerEngine.getCycleIndex(cfg.epoch, storageData.lastCycleStart);
      currentCycleStart = storageData.lastCycleStart;
    } else {
      currentCycleStart = SchedulerEngine.getCycleStart(cfg.epoch, cycleIndex);
    }

    updateCycleUI();
    renderHolidayList();
    renderLeaveRequests();

    const saved = storageData.cycles[currentCycleStart];
    if (saved) {
      loadCycleFromStorage(currentCycleStart);
    } else {
      setStatus('사이클을 선택하고 "이 사이클 일정 생성"을 눌러 시작하세요.');
      renderConditionPanel();
    }

    renderFileStatus();

    // 파일 저장 버튼 이벤트
    connectFileBtn.addEventListener('click',    onConnectFile);
    createFileBtn.addEventListener('click',     onCreateFile);
    disconnectFileBtn.addEventListener('click', onDisconnectFile);

    // FSA 미지원 브라우저면 카드 숨김
    if (!Storage.fsaSupported()) {
      $('fileStorageCard').style.display = 'none';
    }
  }

  // ── 사이클 이동 ───────────────────────────────────────────────────────────
  function navigateCycle(delta) {
    cycleIndex   += delta;
    currentCycleStart = SchedulerEngine.getCycleStart(getCfg().epoch, cycleIndex);
    updateCycleUI();
    const saved = storageData.cycles[currentCycleStart];
    if (saved) {
      loadCycleFromStorage(currentCycleStart);
    } else {
      cycleData = null;
      scheduleContainer.innerHTML = '<p style="padding:24px;color:var(--text-3);text-align:center">저장된 사이클이 없습니다.<br>"이 사이클 일정 생성"을 눌러 시작하세요.</p>';
      renderConditionPanel();
      renderLeaveRequests();
      setStatus('미생성 사이클');
    }
  }

  function navigateToToday() {
    cycleIndex        = SchedulerEngine.getCurrentCycleIndex(getCfg().epoch);
    currentCycleStart = SchedulerEngine.getCycleStart(getCfg().epoch, cycleIndex);
    updateCycleUI();
    const saved = storageData.cycles[currentCycleStart];
    if (saved) loadCycleFromStorage(currentCycleStart);
    else {
      cycleData = null;
      scheduleContainer.innerHTML = '<p style="padding:24px;color:var(--text-3);text-align:center">이 사이클은 아직 생성되지 않았습니다.</p>';
      renderConditionPanel();
      renderLeaveRequests();
    }
  }

  // ── 스토리지 불러오기 ─────────────────────────────────────────────────────
  function loadCycleFromStorage(cycleStart) {
    const saved = storageData.cycles[cycleStart];
    if (!saved) return;
    const days   = saved.days.map(d => Object.assign({}, d, { date: new Date(d.iso + 'T00:00:00.000Z') }));
    const cfg    = getCfg();
    const report = SchedulerEngine.validateSchedule(days, cfg, storageData.fixedAssignments, getHolidays());
    cycleData         = { cycleStartIso: cycleStart, cfg, days, report };
    currentCycleStart = cycleStart;
    render();
    renderLeaveRequests();
    setStatus(`사이클 #${cycleIndex + 1} 불러옴`);
  }

  // ── 생성 ──────────────────────────────────────────────────────────────────
  async function doGenerate() {
    if (!currentCycleStart) { alert('사이클 날짜를 먼저 설정하세요.'); return; }
    const cfg = getCfg();

    // 고정 배정 사전 검증
    const warnings = SchedulerEngine.validateFixedRequests(
      storageData.fixedAssignments, cfg, currentCycleStart);
    if (warnings.length > 0) {
      const msg = warnings.map(w => `• ${w.msg}`).join('\n');
      const proceed = confirm(
        `⚠️ 고정 배정 경고 (${warnings.length}건)\n\n${msg}\n\n그래도 생성하시겠습니까?`);
      if (!proceed) return;
    }

    if (storageData.cycles[currentCycleStart]) {
      if (!confirm(`사이클 #${cycleIndex + 1}이 이미 생성되어 있습니다.\n고정 배정을 유지하고 재생성할까요?`)) return;
    }
    setStatus('일정 생성 중...');
    generateBtn.disabled = true;
    await new Promise(r => setTimeout(r, 30));

    const result = SchedulerEngine.generateSchedule(currentCycleStart, Object.assign({}, cfg, { holidays: getHolidays() }), storageData.fixedAssignments, Date.now());
    SchedulerEngine.applyFixedAssignments(result.days, storageData.fixedAssignments, cfg);
    result.report = SchedulerEngine.validateSchedule(result.days, cfg, storageData.fixedAssignments, getHolidays());

    cycleData = result;
    await persist(false);
    render();
    generateBtn.disabled = false;
    setStatus(result.report.allHardOk
      ? `사이클 #${cycleIndex + 1} 생성 완료 ✅`
      : `사이클 #${cycleIndex + 1} 생성 완료 (일부 조건 미충족)`);
  }

  // ── 저장 ──────────────────────────────────────────────────────────────────
  async function persist(manuallyEdited) {
    if (!cycleData) return;
    const prev = storageData.cycles[currentCycleStart];
    storageData.cycles[currentCycleStart] = {
      days: cycleData.days,
      generatedAt: (prev && prev.generatedAt) || new Date().toISOString(),
      manuallyEdited: !!manuallyEdited,
    };
    storageData.lastCycleStart = currentCycleStart;
    storageData.employees      = currentEmployeeNames();
    await Storage.saveAll(storageData);
  }

  function schedulePersist(manuallyEdited) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { await persist(manuallyEdited); setStatus('저장됨 ✓'); }, 300);
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  function render() { renderSchedule(); renderConditionPanel(); }

  // ── 일정표 ────────────────────────────────────────────────────────────────
  function renderSchedule() {
    if (!cycleData) { scheduleContainer.innerHTML = ''; return; }
    const employees = currentEmployeeNames();
    const { days, report } = cycleData;
    const holMap    = getHolidayMap();
    const holSet    = getHolidaySet();
    const fixedMap  = storageData.fixedAssignments;
    const badDaySet = new Set(report.dayChecks.filter(d => !d.ok).map(d => d.iso));

    let html = '';
    for (let w = 0; w < 4; w++) {
      const weekDays = days.slice(w * 7, w * 7 + 7);
      html += `<div class="week-block">
        <div class="week-title-row">
          <label class="week-check-label">
            <input type="checkbox" class="week-checkbox" data-week="${w}" ${selectedWeeks.has(w) ? 'checked' : ''}>
            내보내기
          </label>
          <span class="week-title">${w + 1}주차 &nbsp; ${weekDays[0].iso} ~ ${weekDays[6].iso}</span>
        </div>
        <table class="schedule-table"><thead><tr><th class="emp-label">직원</th>`;

      weekDays.forEach(d => {
        const isHol     = holSet.has(d.iso);
        const isWeekend = d.weekday === 0 || d.weekday === 6;
        const holName   = holMap[d.iso] || '';
        const cls       = [isHol ? 'holiday-hd' : '', isWeekend ? 'weekend-hd' : ''].filter(Boolean).join(' ');
        html += `<th class="${cls}">
          ${SchedulerEngine.WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}
          ${isHol ? `<span class="hol-name">${escHtml(holName)}</span>` : ''}
        </th>`;
      });
      html += `</tr></thead><tbody>`;

      employees.forEach((name, e) => {
        html += `<tr><td class="emp-label">${escHtml(name)}</td>`;
        weekDays.forEach(d => {
          const v        = d.assignments[e];
          const manualFix = fixedMap[d.iso] && fixedMap[d.iso][e];
          const isAutoHolOff = !manualFix && v === 'OFF' && holSet.has(d.iso) && (d.weekday === 0 || d.weekday === 6);
          const ftype   = manualFix ? manualFix.type : (isAutoHolOff ? 'HOLIDAY_OFF' : null);
          const isFixed = !!manualFix;
          const isBad   = badDaySet.has(d.iso);
          const label   = v === 'OFF' ? (ftype === 'HOLIDAY_OFF' ? '휴일' : '휴무') : v;

          const cls = ['cell', v, ftype ? `fixed-${ftype}` : '', isBad ? 'daybad' : ''].filter(Boolean).join(' ');
          html += `<td class="${cls}" data-day="${d.iso}" data-emp="${e}">${label}`;
          if (isFixed) html += `<span class="lock-icon">🔒</span>`;
          html += `</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;
    }

    scheduleContainer.innerHTML = html;
    scheduleContainer.querySelectorAll('td.cell').forEach(td => {
      td.addEventListener('click', onCellClick);
      td.addEventListener('contextmenu', onCellContextMenu);
    });
    scheduleContainer.querySelectorAll('.week-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const w = Number(cb.dataset.week);
        cb.checked ? selectedWeeks.add(w) : selectedWeeks.delete(w);
      });
    });
  }

  // ── 셀 클릭 ──────────────────────────────────────────────────────────────
  function onCellClick(e) {
    const td     = e.currentTarget;
    const iso    = td.dataset.day;
    const empIdx = Number(td.dataset.emp);
    if (storageData.fixedAssignments[iso] && storageData.fixedAssignments[iso][empIdx]) return;
    const day   = cycleData.days.find(d => d.iso === iso);
    const order = ['O', 'C', 'OFF'];
    day.assignments[empIdx] = order[(order.indexOf(day.assignments[empIdx]) + 1) % 3];
    cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays());
    render();
    schedulePersist(true);
  }

  // ── 우클릭 ───────────────────────────────────────────────────────────────
  function onCellContextMenu(e) {
    e.preventDefault();
    const td = e.currentTarget;
    ctxTarget = { iso: td.dataset.day, empIdx: Number(td.dataset.emp) };
    const mx = e.clientX, my = e.clientY;
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 200, mh = 190;
    contextMenu.style.left = (mx + mw > vw ? mx - mw : mx) + 'px';
    contextMenu.style.top  = (my + mh > vh ? my - mh : my) + 'px';
    contextMenu.classList.remove('hidden');
  }

  function closeContextMenu() { contextMenu.classList.add('hidden'); ctxTarget = null; }

  function onContextMenuAction(action) {
    if (!ctxTarget) return;
    const { iso, empIdx } = ctxTarget;
    closeContextMenu();

    if (action === 'clear') {
      if (storageData.fixedAssignments[iso]) {
        delete storageData.fixedAssignments[iso][empIdx];
        if (!Object.keys(storageData.fixedAssignments[iso]).length) delete storageData.fixedAssignments[iso];
      }
    } else {
      if (!storageData.fixedAssignments[iso]) storageData.fixedAssignments[iso] = {};
      storageData.fixedAssignments[iso][empIdx] = { type: action };
      const day = cycleData && cycleData.days.find(d => d.iso === iso);
      if (day) day.assignments[empIdx] = action === 'HOLIDAY_OFF' ? 'OFF' : action;
    }

    if (cycleData) {
      cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays());
    }
    renderLeaveRequests();
    render();
    schedulePersist(true);
  }

  // ── 배정 요청 ─────────────────────────────────────────────────────────────
  function renderLeaveRequests() {
    const names = currentEmployeeNames();

    // select 옵션 동기화
    const curVal = leaveEmpSelect.value;
    leaveEmpSelect.innerHTML = names.map((n, i) => `<option value="${i}">${escHtml(n)}</option>`).join('');
    leaveEmpSelect.value = curVal;

    // 현재 사이클 범위
    const fa = storageData.fixedAssignments;
    const entries = [];

    if (currentCycleStart) {
      const [y, m, d] = currentCycleStart.split('-').map(Number);
      const startMs = Date.UTC(y, m - 1, d);
      const endMs   = startMs + 27 * 86400000;

      if (reqCycleLabel) reqCycleLabel.textContent = `사이클 #${cycleIndex + 1} (${currentCycleStart} ~ ...)`;

      // 현재 사이클 범위에 속하는 고정 배정만 표시 (HOLIDAY_OFF 제외)
      Object.keys(fa).sort().forEach(iso => {
        const isoMs = new Date(iso + 'T00:00:00Z').getTime();
        if (isoMs < startMs || isoMs > endMs) return;
        Object.keys(fa[iso]).forEach(empStr => {
          const empIdx = Number(empStr);
          const type   = fa[iso][empIdx] && fa[iso][empIdx].type;
          if (type && type !== 'HOLIDAY_OFF') {
            entries.push({ iso, empIdx, type, name: names[empIdx] || `직원${empIdx + 1}` });
          }
        });
      });
    }

    // 뱃지 업데이트
    if (entries.length > 0) {
      requestBadge.textContent = entries.length;
      requestBadge.style.display = '';
    } else {
      requestBadge.style.display = 'none';
    }

    if (entries.length === 0) {
      leaveListEl.innerHTML = '<p class="sc-hint sc-hint-center">이 사이클에 등록된 요청이 없습니다.</p>';
      return;
    }

    const typeLabel = { O: '오픈', C: '마감', OFF: '휴무' };
    leaveListEl.innerHTML = entries.map(({ iso, empIdx, type, name }) =>
      `<div class="req-item">
        <span class="req-emp">${escHtml(name)}</span>
        <span class="req-date">${iso}</span>
        <span class="req-type-badge req-type-${type}">${typeLabel[type] || type}</span>
        <button class="btn-del" data-iso="${iso}" data-emp="${empIdx}">삭제</button>
      </div>`
    ).join('');

    leaveListEl.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => removeLeaveRequest(btn.dataset.iso, Number(btn.dataset.emp)));
    });
  }

  function addLeaveRequest() {
    const empIdx = Number(leaveEmpSelect.value);
    const iso    = leaveDateInput.value;
    const type   = leaveTypeSelect.value;
    if (!iso) { alert('날짜를 선택하세요.'); return; }

    if (!storageData.fixedAssignments[iso]) storageData.fixedAssignments[iso] = {};
    storageData.fixedAssignments[iso][empIdx] = { type };
    leaveDateInput.value = '';

    if (cycleData) {
      const day = cycleData.days.find(d => d.iso === iso);
      if (day) {
        day.assignments[empIdx] = type === 'HOLIDAY_OFF' ? 'OFF' : type;
        cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays());
        render();
      }
    }
    renderLeaveRequests();
    Storage.saveAll(storageData);
  }

  function removeLeaveRequest(iso, empIdx) {
    if (storageData.fixedAssignments[iso]) {
      delete storageData.fixedAssignments[iso][empIdx];
      if (!Object.keys(storageData.fixedAssignments[iso]).length) delete storageData.fixedAssignments[iso];
    }
    renderLeaveRequests();
    if (cycleData) {
      cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays());
      render();
    }
    Storage.saveAll(storageData);
  }

  // ── 조건 패널 ─────────────────────────────────────────────────────────────
  function renderConditionPanel() {
    if (!cycleData) {
      hardConditionsEl.innerHTML = '<p class="cond-placeholder">일정을 먼저 생성하세요.</p>';
      softConditionsEl.innerHTML = '';
      hardOverallEl.textContent  = '';
      softOverallEl.textContent  = '';
      return;
    }

    const { report } = cycleData;
    const cfg   = getCfg();
    const names = currentEmployeeNames();
    const pe    = report.perEmployee;
    const cT    = cfg.cycleWeeks * 7 - cfg.opensPerCycle - cfg.offsPerCycle;

    const dayOk = report.dayChecks.every(d => d.ok) && report.overrideViolations.length === 0;
    const overrideNote = report.overrideViolations.length > 0
      ? `<div class="cond-override-warn">⚠️ 고정배정 충돌: ${report.overrideViolations.map(v => v.iso).join(', ')}</div>`
      : '';

    let tbl = `<table class="cond-table"><thead><tr>
      <th class="ct-name">조건</th><th class="ct-cfg">설정</th>
      ${names.map(n => `<th class="ct-emp">${escHtml(n)}</th>`).join('')}
    </tr></thead><tbody>`;

    const globalRow = (name, cfgVal, ok, note) =>
      `<tr class="${ok ? 'ct-ok' : 'ct-bad'}">
        <td class="ct-name">${name}</td><td class="ct-cfg">${cfgVal}</td>
        <td colspan="${names.length}" class="ct-global">${ok ? '✅' : '❌'}${note ? ' ' + note : ''}</td>
      </tr>`;

    // warnFn(val, pe) → true이면 ⚠ 경고(고정 배정으로 인한 불가피 위반)
    const empRow = (name, cfgVal, vals, okFn, warnFn) => {
      const cells = vals.map((v, i) => {
        const ok   = okFn(v, pe[i]);
        const warn = !ok && warnFn && warnFn(v, pe[i]);
        const cls  = ok ? 'ct-ok' : warn ? 'ct-warn' : 'ct-bad';
        const icon = ok ? '✅' : warn ? '⚠' : '❌';
        return `<td class="ct-emp ${cls}">${v} ${icon}</td>`;
      });
      const allOk  = vals.every((v, i) => okFn(v, pe[i]));
      const anyWarn = !allOk && warnFn && vals.some((v, i) => !okFn(v, pe[i]) && warnFn(v, pe[i]));
      const rowCls  = allOk ? 'ct-ok' : anyWarn ? 'ct-warn' : 'ct-bad';
      return `<tr class="${rowCls}">
        <td class="ct-name">${name}</td><td class="ct-cfg">${cfgVal}</td>
        ${cells.join('')}
      </tr>`;
    };

    // 하드 우선순위 순서로 표시
    tbl += globalRow('① 일별 구성', '오픈1·마감2·휴무1', dayOk,
      report.overrideViolations.length ? `(충돌 ${report.overrideViolations.length}건)` : '');
    tbl += empRow('② 휴무 일수',  `${cfg.offsPerCycle}일`,  pe.map(p => `${p.offs}/${p.offsTarget}`),     (_, p) => p.offs   === p.offsTarget,   (_, p) => false);
    tbl += empRow('③ 마감 횟수',  `${cT}회`,                pe.map(p => `${p.closes}/${p.closesTarget}`), (_, p) => p.closes === p.closesTarget, (_, p) => false);
    tbl += empRow('④ 오픈 횟수',  `${cfg.opensPerCycle}회`, pe.map(p => `${p.opens}/${p.opensTarget}`),   (_, p) => p.opens  === p.opensTarget,  (_, p) => false);
    tbl += empRow('⑤ 주말 휴무',  `${cfg.weekendOffsPerCycle}일`,  pe.map(p => `${p.weekendOff}/${p.weekendOffTarget}`),   (_, p) => p.weekendOff  === p.weekendOffTarget);
    tbl += empRow('⑥ 주말 오픈',  `${cfg.weekendOpensPerCycle}회`, pe.map(p => `${p.weekendOpen}/${p.weekendOpenTarget}`), (_, p) => p.weekendOpen === p.weekendOpenTarget);
    tbl += empRow('⑦ 최대 연속',  `≤${cfg.maxConsecutiveWork}일`,  pe.map(p => `${p.maxStreak}일`),         (_, p) => p.maxStreakOk);
    tbl += empRow('⑧ 6일연속→오픈≥2', '오픈 2회 이상',
      pe.map(p => p.sixDayStreakCount > 0 ? `${p.sixDayStreakCount}회 발생` : '없음'),
      (_, p) => p.sixDayStreakOpenOk);
    tbl += empRow('⑨ 2연속 휴무', '≥1회',                  pe.map(p => `${p.twoConsecCount}회`),          (_, p) => p.twoConsecOk);
    tbl += empRow('⑩ 주별 휴무 분포', '3주×2+1주×1',       pe.map(p => `[${p.weeklyOffs.join(',')}]`),    (_, p) => p.weeklyOffDistOk, (_, p) => p.weeklyOffDistFixedCause);
    tbl += empRow('⑪ 단기블록 전부 마감', '1~3일 블록',
      pe.map(p => p.shortBlockViolations > 0 ? `위반 ${p.shortBlockViolations}일` : '없음'),
      (_, p) => p.shortBlockAllCloseOk);
    tbl += `</tbody></table>`;

    const hardAllOk = dayOk && pe.every(p =>
      p.offs === p.offsTarget && p.closes === p.closesTarget && p.opens === p.opensTarget &&
      p.weekendOff === p.weekendOffTarget && p.weekendOpen === p.weekendOpenTarget &&
      p.maxStreakOk && p.sixDayStreakOpenOk && p.twoConsecOk &&
      (p.weeklyOffDistOk || p.weeklyOffDistFixedCause) &&
      p.shortBlockAllCloseOk);

    hardConditionsEl.innerHTML = overrideNote + tbl;
    hardOverallEl.textContent  = hardAllOk ? '✅' : '❌';

    // 소프트 우선순위 순서로 표시
    const sr = report.softResults;
    const softRow = (name, ok, detail) =>
      `<tr class="${ok ? 'ct-ok' : 'ct-warn'}">
        <td class="ct-name">${name}</td><td class="ct-cfg">선호</td>
        <td colspan="${names.length}" class="ct-global">${ok ? '✅' : '⚠️'} ${escHtml(detail)}</td>
      </tr>`;

    // 소프트 6: 주별 오픈 분포 — 직원별 행으로 표시
    const softEmpRow = (name, vals, okFn, warnFn) => {
      const cells = vals.map((v, i) => {
        const ok   = okFn(v, i);
        const warn = !ok && warnFn && warnFn(v, i);
        const cls  = ok ? 'ct-ok' : warn ? 'ct-warn' : 'ct-warn';
        const icon = ok ? '✅' : '⚠️';
        return `<td class="ct-emp ${cls}">${v} ${icon}</td>`;
      });
      const allOk = vals.every((v, i) => okFn(v, i));
      return `<tr class="${allOk ? 'ct-ok' : 'ct-warn'}">
        <td class="ct-name">${name}</td><td class="ct-cfg">선호</td>
        ${cells.join('')}
      </tr>`;
    };

    let softTbl = `<table class="cond-table"><tbody>`;
    if (cfg.holidayCloserEmployees.length > 0)
      softTbl += softRow('① 공휴일·주말 마감 선호', sr.holidayCloser.violations === 0,
        `위반 ${sr.holidayCloser.violations}/${sr.holidayCloser.total || 0}회`);
    softTbl += softRow('② 블록 내 오픈 연속', sr.openConsecutive.score === 0,
      sr.openConsecutive.score === 0 ? '완전 연속' : `비연속 ${sr.openConsecutive.score}칸`);
    softTbl += softRow('③ 토·일 동일 오픈', sr.weekendSameOpener.violations === 0,
      `위반 ${sr.weekendSameOpener.violations}/${sr.weekendSameOpener.total || 0}회`);
    softTbl += softRow('④ 휴무 전날 오픈', sr.offPrevDayOpen.violations === 0,
      `위반 ${sr.offPrevDayOpen.violations}회`);
    softTbl += softRow('⑤ 휴무 다음날 마감', sr.offNextDayOpen.violations === 0,
      `위반 ${sr.offNextDayOpen.violations}회`);
    softTbl += softEmpRow('⑥ 주별 오픈 분포',
      sr.weeklyOpenDist.perEmployee.map(p => `[${p.vals.join(',')}]`),
      (_, i) => sr.weeklyOpenDist.perEmployee[i].ok,
      (_, i) => sr.weeklyOpenDist.perEmployee[i].fixedCause);
    softTbl += `</tbody></table>`;

    const softAllOk = sr.weekendSameOpener.violations === 0 &&
      sr.holidayCloser.violations === 0 &&
      sr.openConsecutive.score === 0 &&
      sr.offPrevDayOpen.violations === 0 &&
      sr.offNextDayOpen.violations === 0 &&
      sr.weeklyOpenDist.perEmployee.every(p => p.ok);
    softConditionsEl.innerHTML = softTbl;
    softOverallEl.textContent  = softAllOk ? '✅' : '⚠️';
  }

  // ── 공휴일 관리 ───────────────────────────────────────────────────────────
  function renderHolidayList() {
    const holidays = getHolidays().slice().sort((a, b) => a.iso.localeCompare(b.iso));
    if (!holidays.length) { holidayListEl.innerHTML = '<p class="sc-hint">공휴일이 없습니다.</p>'; return; }
    holidayListEl.innerHTML = holidays.map(h =>
      `<div class="holiday-item">
        <span class="hol-iso">${h.iso}</span>
        <span class="hol-name-item">${escHtml(h.name)}</span>
        <button class="btn btn-sm btn-del hol-del" data-iso="${h.iso}">삭제</button>
      </div>`
    ).join('');
    holidayListEl.querySelectorAll('.hol-del').forEach(btn => {
      btn.addEventListener('click', () => deleteHoliday(btn.dataset.iso));
    });
  }

  function addHoliday() {
    const iso  = holidayDateInput.value;
    const name = holidayNameInput.value.trim();
    if (!iso || !name) { alert('날짜와 이름을 입력하세요.'); return; }
    storageData.holidays = getHolidays().filter(h => h.iso !== iso);
    storageData.holidays.push({ iso, name });
    holidayDateInput.value = '';
    holidayNameInput.value = '';
    renderHolidayList();
    if (cycleData) { cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays()); render(); }
    Storage.saveAll(storageData);
  }

  function deleteHoliday(iso) {
    storageData.holidays = getHolidays().filter(h => h.iso !== iso);
    renderHolidayList();
    if (cycleData) { cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays()); render(); }
    Storage.saveAll(storageData);
  }

  // ── 내보내기 ──────────────────────────────────────────────────────────────
  async function onExportImage() {
    if (!cycleData) { alert('먼저 일정을 생성하세요.'); return; }
    const canvas = ExportUtil.buildScheduleCanvas(
      cycleData, currentEmployeeNames(), cycleIndex, selectedWeeks,
      getHolidaySet(), storageData.fixedAssignments, getHolidayMap());
    if (!canvas) { alert('내보낼 주를 하나 이상 선택하세요.'); return; }
    await Storage.exportImage(canvas.toDataURL('image/png'), `근무표_사이클${cycleIndex+1}_${cycleData.cycleStartIso}.png`);
  }

  async function onExportCSV() {
    if (!cycleData) { alert('먼저 일정을 생성하세요.'); return; }
    const csv = ExportUtil.buildCSV(cycleData, currentEmployeeNames(), cycleIndex, selectedWeeks, getHolidaySet());
    await Storage.exportCSV(csv, `근무표_사이클${cycleIndex+1}_${cycleData.cycleStartIso}.csv`);
  }

  async function onExportXLSX() {
    if (!cycleData) { alert('먼저 일정을 생성하세요.'); return; }
    const buffer = await ExportUtil.buildXLSX(
      cycleData, currentEmployeeNames(), cycleIndex, selectedWeeks,
      getHolidaySet(), getHolidayMap(), storageData.fixedAssignments
    );
    if (!buffer) return;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `근무표_사이클${cycleIndex + 1}_${cycleData.cycleStartIso}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── JSON 내보내기/가져오기 ────────────────────────────────────────────────
  function onExportJSON() {
    const json = JSON.stringify(storageData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cafe-scheduler-data-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('데이터 저장 완료');
  }

  function onImportJSON() { importJsonFile.click(); }

  function onImportFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.cycles || !data.fixedAssignments) throw new Error('유효하지 않은 파일');
        storageData = data;
        await Storage.saveAll(storageData);
        // 화면 재초기화
        empInputs.forEach((el, i) => { el.value = storageData.employees[i] || ''; });
        const cfg = getCfg();
        cycleIndex = storageData.lastCycleStart
          ? SchedulerEngine.getCycleIndex(cfg.epoch, storageData.lastCycleStart)
          : SchedulerEngine.getCurrentCycleIndex(cfg.epoch);
        currentCycleStart = storageData.lastCycleStart || SchedulerEngine.getCycleStart(cfg.epoch, cycleIndex);
        updateCycleUI();
        renderHolidayList();
        renderLeaveRequests();
        const saved = storageData.cycles[currentCycleStart];
        if (saved) loadCycleFromStorage(currentCycleStart);
        else { cycleData = null; scheduleContainer.innerHTML = ''; renderConditionPanel(); }
        setStatus('데이터 불러오기 완료');
      } catch (err) {
        alert(`불러오기 실패: ${err.message}`);
      }
      importJsonFile.value = '';
    };
    reader.readAsText(file);
  }

  // ── Epoch 변경 ────────────────────────────────────────────────────────────
  function onEpochChange() {
    const val = epochInput.value;
    if (!val) return;
    if (new Date(val + 'T00:00:00Z').getUTCDay() !== 0) {
      alert('기준일은 반드시 일요일이어야 합니다.');
      epochInput.value = getCfg().epoch;
      return;
    }
    if (!storageData.config) storageData.config = {};
    storageData.config.epoch = val;
    cycleIndex        = SchedulerEngine.getCurrentCycleIndex(val);
    currentCycleStart = SchedulerEngine.getCycleStart(val, cycleIndex);
    updateCycleUI();
    Storage.saveAll(storageData);
    setStatus('기준일 변경됨. 사이클이 재계산되었습니다.');
  }

  // ── 별 토글 ───────────────────────────────────────────────────────────────
  function toggleStar(empIdx) {
    if (!storageData.config) storageData.config = {};
    const list = getCfg().holidayCloserEmployees.slice();
    const pos  = list.indexOf(empIdx);
    pos === -1 ? list.push(empIdx) : list.splice(pos, 1);
    storageData.config.holidayCloserEmployees = list;
    starBtns.forEach(btn => {
      const idx = Number(btn.dataset.idx);
      btn.textContent = list.includes(idx) ? '⭐' : '☆';
      btn.classList.toggle('starred', list.includes(idx));
    });
    if (cycleData) {
      cycleData.report = SchedulerEngine.validateSchedule(cycleData.days, getCfg(), storageData.fixedAssignments, getHolidays());
      renderConditionPanel();
    }
    Storage.saveAll(storageData);
  }

  // ── 아코디언 ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.accordion-header').forEach(hd => {
    hd.addEventListener('click', () => {
      const body   = document.getElementById(hd.dataset.target);
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      hd.querySelector('.acc-arrow').textContent = isOpen ? '▶' : '▾';
      hd.classList.toggle('is-open', !isOpen);
    });
  });

  // ── 이벤트 바인딩 ─────────────────────────────────────────────────────────
  prevCycleBtn.addEventListener('click',   () => navigateCycle(-1));
  nextCycleBtn.addEventListener('click',   () => navigateCycle(+1));
  todayCycleBtn.addEventListener('click',  navigateToToday);
  generateBtn.addEventListener('click',    doGenerate);
  epochInput.addEventListener('change',    onEpochChange);
  exportImageBtn.addEventListener('click',  onExportImage);
  exportCsvBtn.addEventListener('click',    onExportCSV);
  exportXlsxBtn.addEventListener('click',   onExportXLSX);
  exportJsonBtn.addEventListener('click',   onExportJSON);
  importJsonBtn.addEventListener('click',   onImportJSON);
  importJsonFile.addEventListener('change', onImportFileSelected);
  addHolidayBtn.addEventListener('click',  addHoliday);
  addLeaveBtn.addEventListener('click',    addLeaveRequest);

  empInputs.forEach(el => {
    el.addEventListener('change', () => {
      storageData.employees = currentEmployeeNames();
      renderLeaveRequests();
      if (cycleData) render();
      Storage.saveAll(storageData);
    });
  });
  starBtns.forEach(btn => btn.addEventListener('click', () => toggleStar(Number(btn.dataset.idx))));
  contextMenu.querySelectorAll('.cm-item').forEach(item => {
    item.addEventListener('click', () => onContextMenuAction(item.dataset.action));
  });
  document.addEventListener('click',   e => { if (!contextMenu.contains(e.target)) closeContextMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); });

  // ── 유틸 ──────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  init();
})();
