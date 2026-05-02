/**
 * Velo CRM — ReportBuilder (placeholder).
 *
 * The legacy ReportBuilder was a "build your own report" UI keyed on
 * deals, tickets, lead-source, and other concepts that no longer exist
 * in the dental schema. Rather than carry forward dead options, this
 * stub points users back to the prebuilt reports on ReportsPage.
 *
 * A real builder (drag-and-drop dimension/measure picker over the new
 * patients/appointments/payments/treatment_plan_items shape) is roadmap
 * work — not blocking Sprint 0.
 */

import { C, makeBtn, card } from '../design'
import { Icons } from '../components/shared'

export default function ReportBuilder({ lang, dir, isRTL, onBack }) {
  void lang
  return (
    <div dir={dir} style={{ padding: 24 }}>
      <button onClick={onBack} style={{ ...makeBtn('ghost'), marginBottom: 16, gap: 6, fontSize: 13 }}>
        {isRTL ? Icons.arrowRight(16) : Icons.arrowLeft(16)}
        {isRTL ? 'العودة إلى التقارير' : 'Back to Reports'}
      </button>

      <div style={{ ...card, padding: 40, textAlign: 'center', maxWidth: 560, margin: '40px auto' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          {Icons.barChart(28)}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
          {isRTL ? 'منشئ التقارير المخصصة' : 'Custom report builder'}
        </h2>
        <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, margin: '0 0 16px' }}>
          {isRTL
            ? 'قيد التطوير — سيتم إعادة بنائه على بيانات المرضى والمواعيد وبنود خطط العلاج. حتى ذلك الحين، استخدم التقارير الجاهزة في صفحة التقارير.'
            : 'Coming soon — will be rebuilt over patients, appointments, and treatment-plan items. For now, use the prebuilt reports on the Reports page.'}
        </p>
        <button onClick={onBack} className="velo-btn-primary" style={makeBtn('primary')}>
          {isRTL ? 'استعراض التقارير الجاهزة' : 'View prebuilt reports'}
        </button>
      </div>
    </div>
  )
}
