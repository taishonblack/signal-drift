// Session-level report PDF for expired/ended sessions
import jsPDF from "jspdf";
import { type Session } from "@/lib/mock-data";
import { getIncidentsForSession, getEventsForIncident } from "@/lib/quinn-store";

function fmtTs(utc: string): string {
  return new Date(utc).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
}

function fmtTsShort(utc: string): string {
  return new Date(utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function generateSessionReportPDF(session: Session): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addPage = () => { doc.addPage(); y = margin; };
  const checkPage = (needed: number) => { if (y + needed > 275) addPage(); };

  // ─── Header ───
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 44, "F");
  doc.setTextColor(0, 186, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("MAKO", margin, 12);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Technical Session Report", margin, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, 30);
  doc.text(`MAKO does not record video. This report captures metrics, incidents, notes, and markers.`, margin, 36);
  y = 52;

  // ─── Session Details ───
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Session Details", margin, y);
  y += 6;

  const meta = [
    ["Session", session.name],
    ["ID", session.id],
    ["PIN", session.pin],
    ["Status", session.status.toUpperCase()],
    ["Created", fmtTs(session.createdAt)],
    ["Inputs", `${session.inputCount} line(s)`],
  ];

  doc.setFontSize(9);
  meta.forEach(([key, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text(key, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(String(val), margin + 35, y);
    y += 5;
  });
  y += 6;

  // ─── Input Lines ───
  checkPage(20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Input Lines", margin, y);
  y += 7;

  session.inputs.forEach((input) => {
    checkPage(16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 150, 200);
    doc.text(input.label, margin, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const m = input.metrics;
    doc.text(`Codec: ${m.codec} · Resolution: ${m.resolution} · FPS: ${m.fps}`, margin + 3, y);
    y += 4;
    doc.text(`Bitrate: ${m.bitrate} Mbps · Packet Loss: ${m.packetLoss}% · RTT: ${m.rtt}ms`, margin + 3, y);
    y += 4;
    doc.text(`Audio: ${m.audioChannels}ch @ ${m.audioSampleRate}Hz · LUFS: ${m.lufs}`, margin + 3, y);
    y += 6;
  });

  // ─── Incidents ───
  const incidents = getIncidentsForSession(session.id);
  checkPage(20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(`Incidents (${incidents.length})`, margin, y);
  y += 7;

  if (incidents.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("No incidents recorded for this session.", margin, y);
    y += 6;
  }

  incidents.forEach((inc) => {
    checkPage(22);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    if (inc.severity === "critical") doc.setTextColor(220, 38, 38);
    else if (inc.severity === "warn") doc.setTextColor(217, 119, 6);
    else doc.setTextColor(0, 150, 200);
    doc.text(`[${inc.severity.toUpperCase()}] ${inc.summary.slice(0, 90)}`, margin, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.text(`${inc.primaryLineLabel} · ${fmtTs(inc.startedAtUtc)} · Status: ${inc.status}`, margin + 3, y);
    y += 5;

    const events = getEventsForIncident(inc.id);
    events.forEach((ev) => {
      checkPage(6);
      doc.setFontSize(8);
      const evStr = `${fmtTsShort(ev.tsUtc)} — ${ev.type} (${(ev.confidence * 100).toFixed(0)}%) ${JSON.stringify(ev.evidence)}`;
      const lines = doc.splitTextToSize(evStr, contentW - 6);
      doc.text(lines, margin + 6, y);
      y += lines.length * 3.5 + 1;
    });
    y += 4;
  });

  // ─── Footer ───
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`MAKO Session Report · ${session.id} · Page ${p}/${pages}`, margin, 290);
  }

  doc.save(`MAKO-Session-${session.id}.pdf`);
}
