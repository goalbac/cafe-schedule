/**
 * export.js  ―  PNG(Canvas) / CSV / XLSX 내보내기  v2
 */
(function (root) {
  'use strict';

  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  const CELL_COLOR = { O: '#ffd9a8', C: '#bcd4ff', OFF: '#e2e2e2' };

  // 헤더 색상 (HTML 스케줄 테이블과 동일)
  const HDR_DEFAULT  = '#1e293b';
  const HDR_WEEKEND  = '#1d4ed8';
  const HDR_HOLIDAY  = '#b91c1c';
  const HDR_HOL_WKD  = '#7c1c1c';

  // ── PNG 내보내기 ─────────────────────────────────────────────────────────
  function buildScheduleCanvas(scheduleData, employees, cycleIndex, selectedWeeks, holidayIsoSet, fixedAssignments, holidayMap) {
    const { days } = scheduleData;
    const N = employees.length;
    const weeksToExport = [0, 1, 2, 3].filter(w => selectedWeeks.has(w));
    if (weeksToExport.length === 0) return null;

    holidayMap = holidayMap || {};

    const cellW = 96, cellH = 36, labelW = 88;
    const weekTitleH = 28, headerH = 40;          // 공휴일 이름 표시 위해 headerH 확대
    const weekGap    = 12;
    const weekBlockH = weekTitleH + headerH + cellH * N + weekGap;

    const canvasW = labelW + cellW * 7 + 20;
    const titleH  = 38;
    const canvas  = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = titleH + weekBlockH * weeksToExport.length;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── 전체 타이틀 ──
    const firstDay = days[weeksToExport[0] * 7];
    const lastDay  = days[weeksToExport[weeksToExport.length - 1] * 7 + 6];
    ctx.font = 'bold 15px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText(`사이클 #${cycleIndex + 1}  (${firstDay.iso} ~ ${lastDay.iso})`, 10, 26);

    let y = titleH;

    weeksToExport.forEach(w => {
      const weekDays = days.slice(w * 7, w * 7 + 7);

      // ── 주차 타이틀 ── (항상 textAlign='left' 보장)
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(`${w + 1}주차`, 10, y + 18);

      const tblTop = y + weekTitleH;
      const tblW   = labelW + cellW * 7;

      // ── 헤더 행 ──
      // 직원 레이블 셀
      ctx.fillStyle = HDR_DEFAULT;
      ctx.fillRect(10, tblTop, labelW, headerH);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('직원', 10 + labelW / 2, tblTop + headerH / 2 + 4);

      // 날짜 헤더 셀
      weekDays.forEach((d, i) => {
        const x = 10 + labelW + cellW * i;
        const isHol = holidayIsoSet && holidayIsoSet.has(d.iso);
        const isWkd = d.weekday === 0 || d.weekday === 6;
        const holName = isHol ? (holidayMap[d.iso] || '') : '';

        ctx.fillStyle = isHol && isWkd ? HDR_HOL_WKD
                       : isHol         ? HDR_HOLIDAY
                       : isWkd         ? HDR_WEEKEND
                       :                 HDR_DEFAULT;
        ctx.fillRect(x, tblTop, cellW, headerH);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        ctx.textAlign = 'center';

        if (isHol && holName) {
          // 날짜 + 공휴일 이름 2줄 표시
          ctx.fillText(`${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}`,
            x + cellW / 2, tblTop + 14);
          ctx.font = '9px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.fillText(holName, x + cellW / 2, tblTop + 28);
        } else {
          ctx.fillText(`${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}`,
            x + cellW / 2, tblTop + headerH / 2 + 4);
        }
      });

      // ── 직원 행 ──
      employees.forEach((name, e) => {
        const rowY = tblTop + headerH + cellH * e;

        // 이름 셀
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(10, rowY, labelW, cellH);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, rowY, labelW, cellH);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name, 10 + labelW / 2, rowY + cellH / 2 + 4);

        weekDays.forEach((d, i) => {
          const x = 10 + labelW + cellW * i;
          const val     = d.assignments[e];
          const isFixed = fixedAssignments && fixedAssignments[d.iso] && fixedAssignments[d.iso][e];

          ctx.fillStyle = CELL_COLOR[val] || '#fff';
          ctx.fillRect(x, rowY, cellW, cellH);

          if (isFixed) {
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, rowY + 1, cellW - 2, cellH - 2);
          }
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, rowY, cellW, cellH);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
          ctx.textAlign = 'center';
          const lbl = val === 'OFF' ? '휴무' : val;
          ctx.fillText(lbl, x + cellW / 2, rowY + cellH / 2 + 4);

          if (isFixed) {
            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText('🔒', x + cellW - 12, rowY + 10);
          }
        });
      });

      // 주차 하단 구분선
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, tblTop + headerH + cellH * N + 6);
      ctx.lineTo(10 + tblW, tblTop + headerH + cellH * N + 6);
      ctx.stroke();

      y += weekBlockH;
    });

    ctx.textAlign = 'left';
    return canvas;
  }

  // ── CSV 내보내기 ─────────────────────────────────────────────────────────
  function buildCSV(scheduleData, employees, cycleIndex, selectedWeeks, holidayIsoSet) {
    const { days } = scheduleData;
    const weeksToExport = [0, 1, 2, 3].filter(w => selectedWeeks.has(w));
    const lines = [];
    lines.push(`사이클 #${cycleIndex + 1},${days[0].iso} ~ ${days[27].iso}`);
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

  // ── XLSX 내보내기 ────────────────────────────────────────────────────────
  // SheetJS (https://cdn.sheetjs.com) 필요 — index.html에서 로드
  function buildXLSX(scheduleData, employees, cycleIndex, selectedWeeks, holidayIsoSet, holidayMap) {
    if (typeof XLSX === 'undefined') {
      alert('XLSX 라이브러리가 로드되지 않았습니다.');
      return null;
    }
    const { days } = scheduleData;
    const weeksToExport = [0, 1, 2, 3].filter(w => selectedWeeks.has(w));
    holidayMap = holidayMap || {};

    const wb = XLSX.utils.book_new();
    const allRows = [];

    // 타이틀 행
    const firstDay = days[0], lastDay = days[27];
    allRows.push([`사이클 #${cycleIndex + 1}  (${firstDay.iso} ~ ${lastDay.iso})`]);
    allRows.push([]);

    weeksToExport.forEach(w => {
      const weekDays = days.slice(w * 7, w * 7 + 7);
      allRows.push([`${w + 1}주차`]);

      // 헤더
      const hdr = ['직원'].concat(weekDays.map(d => {
        const isHol = holidayIsoSet && holidayIsoSet.has(d.iso);
        const holName = isHol ? ` (${holidayMap[d.iso] || '공휴일'})` : '';
        return `${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}${holName}`;
      }));
      allRows.push(hdr);

      employees.forEach((name, e) => {
        const row = [name].concat(weekDays.map(d => {
          const v = d.assignments[e];
          return v === 'OFF' ? '휴무' : v;
        }));
        allRows.push(row);
      });
      allRows.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // 열 너비 설정
    ws['!cols'] = [{ wch: 10 }].concat(Array(7).fill({ wch: 14 }));

    XLSX.utils.book_append_sheet(wb, ws, `사이클${cycleIndex + 1}`);
    return wb;
  }

  root.ExportUtil = { buildScheduleCanvas, buildCSV, buildXLSX };
})(typeof window !== 'undefined' ? window : globalThis);
