/**
 * storage.js  ―  v2 데이터 모델
 * 우선순위: Electron IPC > File System Access API > localStorage
 */
(function (root) {
  'use strict';

  const LS_KEY   = 'cafe-scheduler-v2';
  const IDB_NAME  = 'cafe-scheduler-fsa';
  const IDB_STORE = 'handles';
  const IDB_KEY   = 'dataFile';

  // ── Electron 감지 ─────────────────────────────────────────────────────────
  function isElectron() {
    return typeof window !== 'undefined' && !!window.electronAPI;
  }

  // ── IndexedDB 헬퍼 (파일 핸들 영속 저장용) ────────────────────────────────
  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }
  async function idbGet(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }
  async function idbPut(key, val) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }
  async function idbDel(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  // ── File System Access API ────────────────────────────────────────────────
  function fsaSupported() {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  }

  let _fileHandle  = null;  // 현재 연결된 파일 핸들
  let _pendingHandle = null; // 복원됐지만 아직 권한 미승인 핸들

  /** 앱 시작 시 호출. 이전에 연결한 파일 핸들을 IDB에서 복원. */
  async function tryRestoreFileHandle() {
    if (isElectron() || !fsaSupported()) return 'none';
    try {
      const handle = await idbGet(IDB_KEY);
      if (!handle) return 'none';
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _fileHandle = handle;
        return 'restored'; // 즉시 사용 가능
      }
      _pendingHandle = handle; // 사용자 제스처 후 requestPermission 필요
      return 'pending';
    } catch (e) {
      return 'none';
    }
  }

  /** pending 상태일 때 사용자가 버튼 클릭(제스처) 후 호출 */
  async function requestPendingPermission() {
    if (!_pendingHandle) return false;
    try {
      const perm = await _pendingHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _fileHandle    = _pendingHandle;
        _pendingHandle = null;
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /** 기존 JSON 파일 선택해서 연결 */
  async function connectFile() {
    if (!fsaSupported()) {
      alert('이 브라우저는 파일 직접 저장을 지원하지 않습니다.\nChrome 또는 Edge를 사용해 주세요.');
      return false;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON 데이터', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      _fileHandle    = handle;
      _pendingHandle = null;
      await idbPut(IDB_KEY, handle);
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
      return false;
    }
  }

  /** 새 JSON 파일 만들어서 연결 */
  async function createAndConnectFile() {
    if (!fsaSupported()) {
      alert('이 브라우저는 파일 직접 저장을 지원하지 않습니다.\nChrome 또는 Edge를 사용해 주세요.');
      return false;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'cafe-scheduler-data.json',
        types: [{ description: 'JSON 데이터', accept: { 'application/json': ['.json'] } }],
      });
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      _fileHandle    = handle;
      _pendingHandle = null;
      await idbPut(IDB_KEY, handle);
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
      return false;
    }
  }

  /** 파일 연결 해제 */
  async function disconnectFile() {
    _fileHandle    = null;
    _pendingHandle = null;
    await idbDel(IDB_KEY);
  }

  function getFileHandle()   { return _fileHandle; }
  function getPendingHandle() { return _pendingHandle; }
  function getFileName()     { return _fileHandle ? _fileHandle.name : null; }

  async function readFromFile() {
    if (!_fileHandle) return null;
    try {
      const file = await _fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (e) { console.error('파일 읽기 실패', e); return null; }
  }

  async function writeToFile(data) {
    if (!_fileHandle) return false;
    try {
      const writable = await _fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      return true;
    } catch (e) { console.error('파일 저장 실패', e); return false; }
  }

  // ── 공용 loadAll / saveAll ────────────────────────────────────────────────
  async function loadAll() {
    let data = null;
    if (isElectron()) {
      data = await window.electronAPI.loadData();
    } else if (_fileHandle) {
      data = await readFromFile();
    } else {
      try { data = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { /* ignore */ }
    }
    if (data && data.cycles) return data;

    // v1 → v2 마이그레이션
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
    if (_fileHandle) {
      await writeToFile(data);
      // localStorage도 동기화해서 파일 연결 끊겨도 최후 데이터 보존
      try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      return;
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('localStorage 저장 실패', e); }
  }

  function emptyData() {
    return {
      employees: ['직원1', '직원2', '직원3', '직원4'],
      config: null,
      holidays: null,
      fixedAssignments: {},
      cycles: {},
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

  root.Storage = {
    isElectron, fsaSupported,
    tryRestoreFileHandle, requestPendingPermission,
    connectFile, createAndConnectFile, disconnectFile,
    getFileHandle, getPendingHandle, getFileName,
    loadAll, saveAll, emptyData,
    exportImage, exportCSV,
  };
})(typeof window !== 'undefined' ? window : globalThis);
