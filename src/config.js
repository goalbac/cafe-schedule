'use strict';
/* global AppConfig */
const AppConfig = (function () {
  const DEFAULT_HOLIDAYS = [
    // ── 2025 ──
    { iso: '2025-01-01', name: '신정' },
    { iso: '2025-01-28', name: '설날연휴' },
    { iso: '2025-01-29', name: '설날' },
    { iso: '2025-01-30', name: '설날연휴' },
    { iso: '2025-03-01', name: '삼일절' },
    { iso: '2025-05-05', name: '어린이날/석가탄신일' },
    { iso: '2025-05-06', name: '대체공휴일' },
    { iso: '2025-06-06', name: '현충일' },
    { iso: '2025-08-15', name: '광복절' },
    { iso: '2025-10-03', name: '개천절' },
    { iso: '2025-10-05', name: '추석연휴' },
    { iso: '2025-10-06', name: '추석' },
    { iso: '2025-10-07', name: '추석연휴' },
    { iso: '2025-10-08', name: '대체공휴일' },
    { iso: '2025-10-09', name: '한글날' },
    { iso: '2025-12-25', name: '성탄절' },
    // ── 2026 ──
    { iso: '2026-01-01', name: '신정' },
    { iso: '2026-02-16', name: '설날연휴' },
    { iso: '2026-02-17', name: '설날' },
    { iso: '2026-02-18', name: '설날연휴' },
    { iso: '2026-03-01', name: '삼일절' },
    { iso: '2026-05-05', name: '어린이날' },
    { iso: '2026-05-24', name: '석가탄신일' },
    { iso: '2026-06-06', name: '현충일' },
    { iso: '2026-08-15', name: '광복절' },
    { iso: '2026-09-24', name: '추석연휴' },
    { iso: '2026-09-25', name: '추석' },
    { iso: '2026-09-26', name: '추석연휴' },
    { iso: '2026-10-03', name: '개천절' },
    { iso: '2026-10-09', name: '한글날' },
    { iso: '2026-12-25', name: '성탄절' },
    // ── 2027 ──
    { iso: '2027-01-01', name: '신정' },
    { iso: '2027-02-06', name: '설날연휴' },
    { iso: '2027-02-07', name: '설날' },
    { iso: '2027-02-08', name: '설날연휴' },
    { iso: '2027-03-01', name: '삼일절' },
    { iso: '2027-05-05', name: '어린이날' },
    { iso: '2027-05-13', name: '석가탄신일' },
    { iso: '2027-06-06', name: '현충일' },
    { iso: '2027-08-15', name: '광복절' },
    { iso: '2027-10-03', name: '개천절' },
    { iso: '2027-10-09', name: '한글날' },
    { iso: '2027-10-14', name: '추석연휴' },
    { iso: '2027-10-15', name: '추석' },
    { iso: '2027-10-16', name: '추석연휴' },
    { iso: '2027-12-25', name: '성탄절' },
  ];

  const DEFAULT_CONFIG = {
    epoch: '2025-01-05',            // 기준 일요일 (변경 가능)
    numEmployees: 4,
    cycleWeeks: 4,
    opensPerCycle: 7,               // 1인당 오픈 7회
    offsPerCycle: 7,                // 1인당 휴무 7일
    maxConsecutiveWork: 5,          // 최대 연속 근무 5일
    weekendOpensPerCycle: 2,        // 주말 오픈 2회
    weekendOffsPerCycle: 2,         // 주말 휴무 2일
    requireOneTwoConsecutiveOff: true,
    holidayCloserEmployees: [],     // ⭐ 공휴일 마감 선호 직원 인덱스 배열
  };

  return { DEFAULT_HOLIDAYS, DEFAULT_CONFIG };
})();
