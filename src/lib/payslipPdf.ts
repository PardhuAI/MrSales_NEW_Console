import type { jsPDF as JsPDF } from 'jspdf';
import type { Company, PayslipRow } from '../live/pay';

/**
 * A payslip as a PDF, drawn in the browser from the database's own figures:
 * the company (name, address, GSTIN, logo), the person, the days, every
 * earning and deduction, and the net pay in figures and in words. jsPDF is
 * loaded only when somebody releases payslips.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const rupees = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const upTo99 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const upTo999 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', upTo99(n % 100)].filter(Boolean).join(' ');

/** "Twenty Seven Thousand One Hundred Eighty Seven Rupees Only", in the Indian system (lakh, crore). */
export function inWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${upTo999(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (n) parts.push(upTo999(n));
  return `${parts.join(' ')} Rupees Only`;
}

/** An image for jsPDF: PNG and JPEG as they are; an SVG drawn to a PNG first. */
async function imageFor(dataUrl: string): Promise<{ data: string; format: 'PNG' | 'JPEG'; ratio: number } | null> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('logo did not load'));
  });
  img.src = dataUrl;
  try { await loaded; } catch { return null; }
  const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
  if (dataUrl.startsWith('data:image/png')) return { data: dataUrl, format: 'PNG', ratio };
  if (dataUrl.startsWith('data:image/jpeg')) return { data: dataUrl, format: 'JPEG', ratio };
  const canvas = document.createElement('canvas');
  canvas.height = 240;
  canvas.width = Math.round(240 * ratio);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/png'), format: 'PNG', ratio };
}

export async function payslipPdf(company: Company, row: PayslipRow, month: string): Promise<Blob> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), company.logo ? imageFor(company.logo) : Promise.resolve(null)]);
  const pdf: JsPDF = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 16;
  const ink: [number, number, number] = [29, 29, 31];
  const muted: [number, number, number] = [99, 99, 104];
  const rule: [number, number, number] = [220, 220, 226];
  let y = M;

  // The company.
  let textX = M;
  if (logo) {
    const h = 14;
    pdf.addImage(logo.data, logo.format, M, y, Math.min(h * logo.ratio, 40), h);
    textX = M + Math.min(h * logo.ratio, 40) + 5;
  }
  pdf.setTextColor(...ink).setFont('helvetica', 'bold').setFontSize(14).text(company.name || 'Company', textX, y + 5);
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...muted);
  const addr = [company.address, company.state].filter(Boolean).join(', ');
  const addrLines = addr ? pdf.splitTextToSize(addr, W - M - textX) as string[] : [];
  addrLines.slice(0, 2).forEach((l, i) => pdf.text(l, textX, y + 10 + i * 4));
  const ids = [company.gstin && `GSTIN ${company.gstin}`, company.pan && `PAN ${company.pan}`].filter(Boolean).join('   ');
  if (ids) pdf.text(ids, textX, y + 10 + Math.min(addrLines.length, 2) * 4);
  y += 26;

  const [yy, mm] = month.split('-').map(Number);
  pdf.setDrawColor(...rule).setLineWidth(0.3).line(M, y, W - M, y);
  y += 8;
  pdf.setTextColor(...ink).setFont('helvetica', 'bold').setFontSize(12).text(`Payslip for ${MONTHS[mm - 1]} ${yy}`, M, y);
  y += 8;

  // The person and the days.
  const facts: [string, string][] = [
    ['Name', row.name], ['Employee code', row.code || '-'], ['Role', row.designation || '-'], ['Headquarters', row.hq || '-'],
    ['Days in the month', String(row.daysInMonth)], ['Loss of pay', `${row.lopDays} ${row.lopDays === 1 ? 'day' : 'days'}`], ['Days paid', String(row.paidDays)],
  ];
  pdf.setFontSize(9);
  facts.forEach(([k, v], i) => {
    const col = i < 4 ? 0 : 1;
    const r = i < 4 ? i : i - 4;
    const x = M + col * 95;
    pdf.setFont('helvetica', 'normal').setTextColor(...muted).text(k, x, y + r * 6);
    pdf.setFont('helvetica', 'bold').setTextColor(...ink).text(v, x + 34, y + r * 6);
  });
  y += 4 * 6 + 6;

  // Earnings and deductions, side by side.
  const earnings = row.lines.filter(l => l.kind === 'earning');
  const deductions = row.lines.filter(l => l.kind === 'deduction');
  const colW = (W - 2 * M - 8) / 2;
  const table = (x: number, title: string, lines: typeof row.lines, total: number, totalLabel: string) => {
    let ty = y;
    pdf.setFillColor(245, 245, 247).rect(x, ty - 4.5, colW, 7, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ink).text(title, x + 2, ty);
    pdf.text('Amount', x + colW - 2, ty, { align: 'right' });
    ty += 7;
    pdf.setFont('helvetica', 'normal');
    for (const l of lines) {
      pdf.setTextColor(...ink).text(l.oneOff ? `${l.name} (one-off)` : l.name, x + 2, ty);
      pdf.text(rupees(l.amount), x + colW - 2, ty, { align: 'right' });
      if (l.amount !== l.full && !l.oneOff) {
        pdf.setFontSize(7.5).setTextColor(...muted).text(`of ${rupees(l.full)} for the full month`, x + 2, ty + 3.5).setFontSize(9);
        ty += 3.5;
      }
      ty += 6;
    }
    pdf.setDrawColor(...rule).line(x, ty - 3, x + colW, ty - 3);
    pdf.setFont('helvetica', 'bold').setTextColor(...ink).text(totalLabel, x + 2, ty + 1.5);
    pdf.text(rupees(total), x + colW - 2, ty + 1.5, { align: 'right' });
    return ty + 1.5;
  };
  const endA = table(M, 'Earnings', earnings, row.gross, 'Gross earnings');
  const endB = table(M + colW + 8, 'Deductions', deductions, row.deductions, 'Total deductions');
  y = Math.max(endA, endB) + 12;

  // Net pay.
  pdf.setFillColor(245, 245, 247).rect(M, y - 6, W - 2 * M, 18, 'F');
  pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...ink).text('Net pay', M + 4, y + 1);
  pdf.setFontSize(14).text(rupees(row.net), W - M - 4, y + 2, { align: 'right' });
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...muted).text(inWords(row.net), M + 4, y + 8);
  y += 24;

  pdf.setFontSize(8).setTextColor(...muted)
    .text('This payslip is generated by Mr Sales from the company\'s payroll and needs no signature.', M, 285);
  return pdf.output('blob');
}
