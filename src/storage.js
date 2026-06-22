/**
 * storage.js  ―  v2 데이터 모델
 * Electron: electronAPI IPC  /  브라우저: localStorage
 */
(function (root) {
  'use strict';

  const LS_KEY = 'cafe-scheduler-v2';

  function isElectron() {
    return typeof window !== 'undefined' && !!window.electronAPI;
  }

  async function loadAll() {
    let data = null;
    if (isElectron()) {
      data = await window.electronAPI.loadData();
    } else {
      try { data = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { /* ignore */ }
    }
    if (data && data.cycles) return data;   // v2 형식

    // v1 → v2 마이그레이션 (직원 이름만 이전)
    const fresh = emptyData();
    if (!data) {
      try {
        const old = JSON.parse(localStorage.getItem('cafe-scheduler-data-v1'));
        if (old && old.employees) fresh.employees = old.employees;
      } catch (e) { /* ignore */ }
    }
    return fresh;
  }

  async function saveAll(data) {
    if (isElectron()) { await window.electronAPI.saveData(data); return; }
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('localStorage 저장 실패', e); }
  }

  function emptyData() {
    return {
      employees: ['직원1', '직원2', '직원3', '직원4'],
      config: null,            // null → AppConfig.DEFAULT_CONFIG 사용
      holidays: null,          // null → AppConfig.DEFAULT_HOLIDAYS 사용
      fixedAssignments: {},    // { 'YYYY-MM-DD': { empIdx: { type } } }
      cycles: {},              // { 'YYYY-MM-DD(cycleStart)': { days, generatedAt, manuallyEdited } }
      lastCycleStart: null,
    };
  }

  async function exportImage(dataUrl, name) {
    if (isElectron()) return window.electronAPI.exportImage(dataUrl, name);
    const a = document.createElement('a');
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function exportCSV(csv, name) {
    if (isElectron()) return window.electronAPI.exportCSV(csv, name);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  root.Storage = { isElectron, loadAll, saveAll, emptyData, exportImage, exportCSV };
})(typeof window !== 'undefined' ? window : globalThis);
