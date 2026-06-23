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

  // ── XLSX 내보내기 (ExcelJS — 스타일 완전 지원) ───────────────────────────
  // unpkg.com/exceljs@4.4.0/dist/exceljs.min.js 필요 — index.html에서 로드
  async function buildXLSX(scheduleData, employees, cycleIndex, selectedWeeks, holidayIsoSet, holidayMap, fixedAssignments) {
    if (typeof ExcelJS === 'undefined') {
      alert('ExcelJS 라이브러리가 로드되지 않았습니다.');
      return null;
    }
    const { days } = scheduleData;
    const weeksToExport = [0, 1, 2, 3].filter(w => selectedWeeks.has(w));
    holidayMap       = holidayMap       || {};
    fixedAssignments = fixedAssignments || {};

    // ── 색상 팔레트 (ARGB: FF + hex6) ──
    const A = hex => 'FF' + hex;
    const C = {
      hdrDefault: '1E293B', hdrWeekend: '1D4ED8',
      hdrHoliday: 'B91C1C', hdrHolWkd:  '7C1C1C',
      cellO:      'FFD9A8', cellC:       'BCD4FF',
      cellOff:    'E2E2E2', cellFixed:   'EFF6FF',
      weekTitle:  'FEF9C3', titleBg:     'F0F9FF',
      empName:    'F1F5F9', white:        'FFFFFF',
      borderGray: 'CBD5E1', borderFixed:  '3B82F6',
      textDark:   '0F172A', textLight:    'FFFFFF',
    };

    function mkBorder(hex, style) {
      const b = { style: style || 'thin', color: { argb: A(hex) } };
      return { top: b, bottom: b, left: b, right: b };
    }

    function cellLabel(v, isFixed, isHol) {
      if (v === 'O')   return isFixed ? 'O (고정)' : 'O';
      if (v === 'C')   return isFixed ? 'C (고정)' : 'C';
      if (v === 'OFF') {
        if (isFixed && isHol) return '휴일고정휴무';
        if (isFixed)          return '고정휴무';
        if (isHol)            return '휴일휴무';
        return '휴무';
      }
      return v || '';
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = '카페 근무표 자동생성기 v2';
    const ws = wb.addWorksheet(`사이클${cycleIndex + 1}`);

    ws.columns = [{ width: 10 }].concat(Array(7).fill({ width: 13 }));

    // 셀 스타일 적용 헬퍼
    function sc(cell, value, opts) {
      cell.value = value;
      if (opts.bg) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: A(opts.bg) } };
      }
      cell.font = {
        name: '맑은 고딕', size: opts.size || 10,
        bold: !!opts.bold,
        color: { argb: A(opts.fg || C.textDark) },
      };
      cell.alignment = {
        horizontal: opts.h || 'center', vertical: 'middle',
        wrapText: !!opts.wrap,
      };
      if (opts.border !== false) {
        cell.border = mkBorder(opts.fixedB ? C.borderFixed : C.borderGray, opts.fixedB ? 'medium' : 'thin');
      }
    }

    let r = 1;

    // ── 타이틀 행 ──
    ws.mergeCells(r, 1, r, 8);
    sc(ws.getCell(r, 1), `사이클 #${cycleIndex + 1}  (${days[0].iso} ~ ${days[27].iso})`, {
      bg: C.titleBg, size: 12, bold: true, h: 'left', border: false,
    });
    ws.getRow(r).height = 22;
    r++;
    ws.getRow(r).height = 6; r++; // 빈 행

    weeksToExport.forEach(w => {
      const weekDays = days.slice(w * 7, w * 7 + 7);

      // ── 주차 제목 행 ──
      ws.mergeCells(r, 1, r, 8);
      sc(ws.getCell(r, 1), `${w + 1}주차`, { bg: C.weekTitle, size: 11, bold: true, h: 'left', border: false });
      ws.getRow(r).height = 20; r++;

      // ── 날짜 헤더 행 ──
      sc(ws.getCell(r, 1), '직원', { bg: C.hdrDefault, bold: true, fg: C.textLight });
      weekDays.forEach((d, i) => {
        const isHol = holidayIsoSet && holidayIsoSet.has(d.iso);
        const isWkd = d.weekday === 0 || d.weekday === 6;
        const bg    = isHol && isWkd ? C.hdrHolWkd
                    : isHol          ? C.hdrHoliday
                    : isWkd          ? C.hdrWeekend : C.hdrDefault;
        const holName = isHol ? (holidayMap[d.iso] || '공휴일') : '';
        const label   = holName
          ? `${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}\n(${holName})`
          : `${WEEKDAY_LABELS[d.weekday]} ${d.date.getUTCMonth() + 1}/${d.date.getUTCDate()}`;
        sc(ws.getCell(r, i + 2), label, { bg, bold: true, fg: C.textLight, wrap: !!holName });
      });
      ws.getRow(r).height = 22; r++;

      // ── 직원 행 ──
      employees.forEach((name, e) => {
        sc(ws.getCell(r, 1), name, { bg: C.empName, bold: true });
        weekDays.forEach((d, i) => {
          const v       = d.assignments[e];
          const isHol   = holidayIsoSet && holidayIsoSet.has(d.iso);
          const isFixed = !!(fixedAssignments[d.iso] && fixedAssignments[d.iso][e]);
          const label   = cellLabel(v, isFixed, isHol);
          const bg      = isFixed   ? C.cellFixed
                        : v === 'O'   ? C.cellO
                        : v === 'C'   ? C.cellC
                        : v === 'OFF' ? C.cellOff : C.white;
          sc(ws.getCell(r, i + 2), label, { bg, bold: isFixed, fixedB: isFixed });
        });
        ws.getRow(r).height = 18; r++;
      });

      ws.getRow(r).height = 6; r++; // 주차 간 빈 행
    });

    const buffer = await wb.xlsx.writeBuffer();
    return buffer;
  }

  root.ExportUtil = { buildScheduleCanvas, buildCSV, buildXLSX };
})(typeof window !== 'undefined' ? window : globalThis);
