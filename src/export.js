/**
 * export.js  ―  PNG(Canvas) / CSV 내보내기  v2
 * - 주차 체크박스로 선택한 주만 내보내기
 * - PNG 헤더 색상: 짝수 사이클=빨강, 홀수 사이클=노랑
 * - 공휴일 날짜 헤더에 ★ 표시
 */
(function (root) {
  'use strict';

  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  const CELL_COLOR = { O: '#ffd9a8', C: '#bcd4ff', OFF: '#e2e2e2' };
  const CYCLE_HEADER_COLORS = ['#c0392b', '#e67e22']; // 짝수=빨강, 홀수=주황노랑

  /**
   * @param {object}  scheduleData  { cycleStartIso, days, cfg }
   * @param {string[]} employees
   * @param {number}  cycleIndex    0-based 사이클 인덱스
   * @param {Set}     selectedWeeks 내보낼 주 인덱스 Set (0~3)
   * @param {Set}     holidayIsoSet 공휴일 ISO 문자열 Set
   * @param {object}  fixedAssignments
   */
  function buildScheduleCanvas(scheduleData, employees, cycleIndex, selectedWeeks, holidayIsoSet, fixedAssignments) {
    const { days } = scheduleData;
    const N = employees.length;
    const weeksToExport = [0, 1, 2, 3].filter(w => selectedWeeks.has(w));
    if (weeksToExport.length === 0) return null;

    const headerBg = CYCLE_HEADER_COLORS[cycleIndex % 2];
    const cellW = 96, cellH = 36, labelW = 88;
    const weekTitleH = 24, headerH = 32;
    const weekBlockH = weekTitleH + headerH + cellH * N + 16;

    const canvas = document.createElement('canvas');
    canvas.width = labelW + cellW * 7 + 20;
    canvas.height = weekBlockH * weeksToExport.length + 46;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const firstDay = days[weeksToExport[0] * 7];
    const lastDay  = days[weeksToExport[weeksToExport.length - 1] * 7 + 6];
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#222';
    ctx.fillText(
      `사이클 #${cycleIndex + 1}  (${firstDay.iso} ~ ${lastDay.iso})`,
      10, 22
    );

    let y = 34;
    weeksToExport.forEach(w => {
      const weekDays = days.slice(w * 7, w * 7 + 7);

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#555';
      ctx.fillText(`${w + 1}주차`, 10, y + 14);

      const tblTop = y + weekTitleH;

      // 헤더
      ctx.fillStyle = headerBg;
      ctx.fillRect(10, tblTop, labelW + cellW * 7, headerH);
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('직원', 10 + labelW / 2, tblTop + headerH / 2 + 4);
      weekDays.forEach((d, i) => {
        const x = 10 + labelW + cellW * i + cellW / 2;
        const isHol = holidayIsoSet && holidayIsoSet.has(d.iso);
        const lbl = `${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}${isHol ? ' ★' : ''}`;
        ctx.fillText(lbl, x, tblTop + headerH / 2 + 4);
      });

      // 직원 행
      employees.forEach((name, e) => {
        const rowY = tblTop + headerH + cellH * e;
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(10, rowY, labelW, cellH);
        ctx.strokeStyle = '#bbb';
        ctx.strokeRect(10, rowY, labelW, cellH);
        ctx.fillStyle = '#222';
        ctx.font = '12px sans-serif';
        ctx.fillText(name, 10 + labelW / 2, rowY + cellH / 2 + 4);

        weekDays.forEach((d, i) => {
          const x = 10 + labelW + cellW * i;
          const val = d.assignments[e];
          const isFixed = fixedAssignments && fixedAssignments[d.iso] && fixedAssignments[d.iso][e];

          ctx.fillStyle = CELL_COLOR[val] || '#fff';
          ctx.fillRect(x, rowY, cellW, cellH);

          if (isFixed) {
            // 고정 배정: 진한 테두리
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, rowY + 1, cellW - 2, cellH - 2);
            ctx.lineWidth = 1;
          }

          ctx.strokeStyle = '#bbb';
          ctx.strokeRect(x, rowY, cellW, cellH);
          ctx.fillStyle = '#222';
          ctx.font = `bold 12px sans-serif`;
          const lbl = val === 'OFF' ? '휴무' : val;
          ctx.fillText(lbl, x + cellW / 2, rowY + cellH / 2 + 4);

          if (isFixed) {
            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#666';
            ctx.fillText('🔒', x + cellW - 12, rowY + 10);
          }
        });
      });

      y += weekBlockH;
    });

    ctx.textAlign = 'left';
    return canvas;
  }

  /**
   * CSV 내보내기
   */
  function buildCSV(scheduleData, employees, cycleIndex, selectedWeeks, holidayIsoSet) {
    const { days } = scheduleData;
    const weeksToExport = [0, 1, 2, 3].filter(w => selectedWeeks.has(w));
    const colorName = cycleIndex % 2 === 0 ? '빨강' : '노랑';
    const lines = [];
    lines.push(`사이클 #${cycleIndex + 1},${days[0].iso} ~ ${days[27].iso},색상:${colorName}`);
    lines.push('');

    weeksToExport.forEach(w => {
      const weekDays = days.slice(w * 7, w * 7 + 7);
      lines.push(`${w + 1}주차`);
      const header = ['직원'].concat(weekDays.map(d => {
        const isHol = holidayIsoSet && holidayIsoSet.has(d.iso) ? '★' : '';
        return `${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}${isHol}`;
      }));
      lines.push(header.join(','));
      employees.forEach((name, e) => {
        const row = [name].concat(weekDays.map(d => {
          const v = d.assignments[e];
          return v === 'OFF' ? '휴무' : v;
        }));
        lines.push(row.join(','));
      });
      lines.push('');
    });

    return lines.join('\n');
  }

  root.ExportUtil = { buildScheduleCanvas, buildCSV };
})(typeof window !== 'undefined' ? window : globalThis);
