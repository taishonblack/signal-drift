// PDF incident report generator using jsPDF
import jsPDF from "jspdf";
import {
  type Incident,
  type QuinnEvent,
  getEventsForIncident,
} from "@/lib/quinn-store";

const eventTypeLabels: Record<string, string> = {
  packet_loss_spike: "Packet Loss Spike",
  bitrate_drop: "Bitrate Drop",
  freeze_detected: "Freeze Detected",
  pts_jump: "PTS Jump",
  audio_clipping: "Audio Clipping",
  black_frames: "Black Frames",
  resolution_change: "Resolution Change",
  codec_change: "Codec Change",
};

function fmtTs(utc: string): string {
  const d = new Date(utc);
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
}

function fmtTsShort(utc: string): string {
  return new Date(utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const recommendedChecks: Record<string, string[]> = {
  packet_loss_spike: [
    "Verify network path stability (traceroute / MTR)",
    "Check SRT sender buffer and latency settings",
    "Confirm no bandwidth contention on shared links",
    "Review encoder bitrate vs. available headroom",
  ],
  bitrate_drop: [
    "Check encoder health and CPU/GPU utilization",
    "Verify CBR/VBR mode and min-bitrate settings",
    "Look for upstream congestion or rate limiting",
    "Confirm source signal is stable (no black/freeze at input)",
  ],
  freeze_detected: [
    "Inspect decoder buffer underrun counters",
    "Check for PTS discontinuities around freeze window",
    "Verify source encoder is not dropping frames",
    "Review SRT too-late-to-play packet stats",
  ],
  pts_jump: [
    "Check encoder clock source stability",
    "Verify no signal interruption at source",
    "Review SRT stats for retransmit spikes around event",
    "Inspect GOP structure for irregularities",
  ],
  audio_clipping: [
    "Review audio input levels at source",
    "Check limiter/compressor settings in the chain",
    "Verify audio reference level alignment (-20 dBFS = 0 VU)",
    "Monitor LUFS loudness over sliding window",
  ],
  black_frames: [
    "Check physical cable / SDI connection at source",
    "Verify encoder input signal presence",
    "Review upstream switcher / router configuration",
    "Check for HDCP or format mismatch issues",
  ],
  resolution_change: [
    "Confirm intentional format change with production",
    "Verify downstream decoders handle resolution switch",
    "Check auto-scaling / ABR ladder configuration",
  ],
  codec_change: [
    "Confirm intentional codec switch with engineering",
    "Verify decoder compatibility with new codec profile",
    "Check for encoder failover or redundancy switch",
  ],
};

export function generateIncidentPDF(incident: Incident): void {
  const events = getEventsForIncident(incident.id);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addPage = () => { doc.addPage(); y = margin; };
  const checkPage = (needed: number) => { if (y + needed > 275) addPage(); };

  // ─── Header ───
  doc.setFillColor(15, 23, 42); // dark bg
  doc.rect(0, 0, pageW, 40, "F");
  doc.setTextColor(0, 186, 255); // primary cyan
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("MAKO", margin, 12);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Incident Report", margin, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text(`Generated ${new Date().toLocaleString()} · ${incident.id}`, margin, 30);
  y = 48;

  // ─── Summary ───
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const summaryLines = doc.splitTextToSize(incident.summary, contentW);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 4.5 + 4;

  // ─── Metadata table ───
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Details", margin, y);
  y += 6;

  const meta = [
    ["Session", incident.sessionName],
    ["Line", incident.primaryLineLabel],
    ["Severity", incident.severity.toUpperCase()],
    ["Status", incident.status.toUpperCase()],
    ["Started", fmtTs(incident.startedAtUtc)],
    ["Ended", incident.endedAtUtc ? fmtTs(incident.endedAtUtc) : "Ongoing"],
    ["Created By", incident.createdBy],
  ];

  doc.setFontSize(9);
  meta.forEach(([key, val]) => {
    checkPage(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text(key, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(String(val), margin + 35, y);
    y += 5;
  });
  y += 4;

  // ─── Event Timeline ───
  checkPage(20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(`Event Timeline (${events.length})`, margin, y);
  y += 7;

  // Table header
  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y - 3.5, contentW, 6, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Time", margin + 1, y);
  doc.text("Type", margin + 28, y);
  doc.text("Severity", margin + 72, y);
  doc.text("Confidence", margin + 95, y);
  doc.text("Evidence", margin + 120, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  events.forEach((ev) => {
    checkPage(8);
    doc.setFontSize(8);
    doc.text(fmtTsShort(ev.tsUtc), margin + 1, y);
    doc.text(eventTypeLabels[ev.type] ?? ev.type, margin + 28, y);

    // Color-code severity
    if (ev.severity === "critical") doc.setTextColor(220, 38, 38);
    else if (ev.severity === "warn") doc.setTextColor(217, 119, 6);
    else doc.setTextColor(0, 150, 200);
    doc.text(ev.severity.toUpperCase(), margin + 72, y);
    doc.setTextColor(30, 30, 30);

    doc.text(`${(ev.confidence * 100).toFixed(0)}%`, margin + 95, y);

    const evStr = Object.entries(ev.evidence).map(([k, v]) => `${k}: ${v}`).join(", ");
    const evLines = doc.splitTextToSize(evStr, contentW - 120);
    doc.setFontSize(7);
    doc.text(evLines, margin + 120, y);
    y += Math.max(evLines.length * 3.5, 5) + 1;
  });
  y += 4;

  // ─── Evidence Summary ───
  checkPage(15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Evidence Summary", margin, y);
  y += 7;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  events.forEach((ev) => {
    checkPage(12);
    doc.setFont("helvetica", "bold");
    doc.text(`${eventTypeLabels[ev.type] ?? ev.type} @ ${fmtTsShort(ev.tsUtc)}`, margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    Object.entries(ev.evidence).forEach(([k, v]) => {
      checkPage(5);
      doc.setTextColor(100, 100, 100);
      doc.text(`  ${k}:`, margin, y);
      doc.setTextColor(30, 30, 30);
      doc.text(String(v), margin + 40, y);
      y += 4;
    });
    y += 2;
  });

  // ─── Recommended Checks ───
  checkPage(20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Recommended Checks", margin, y);
  y += 7;

  const usedTypes = new Set(events.map((e) => e.type));
  doc.setFontSize(8);
  usedTypes.forEach((type) => {
    const checks = recommendedChecks[type] ?? [];
    if (checks.length === 0) return;
    checkPage(8 + checks.length * 5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 150, 200);
    doc.text(eventTypeLabels[type] ?? type, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    checks.forEach((check, i) => {
      checkPage(5);
      doc.text(`${i + 1}. ${check}`, margin + 3, y);
      y += 4.5;
    });
    y += 3;
  });

  // ─── Footer ───
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`MAKO Incident Report · ${incident.id} · Page ${p}/${pages}`, margin, 290);
  }

  doc.save(`MAKO-Incident-${incident.id}.pdf`);
}
