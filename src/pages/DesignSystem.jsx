import { useState } from 'react'
import {
  GlassCard, Button, Input, Select, Modal,
  Toast, ToastContainer, Badge, Avatar, EmptyState,
  SkeletonGlass, SkeletonGlassCard,
} from '../components/ui'

/* ── Inline icons used across the showcase ───────────────────────────── */
const SearchIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const PlusIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const ArrowRight = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const MailIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
)

/* ── Section helper ──────────────────────────────────────────────────── */
function Section({ id, eyebrow, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-12 flex flex-col gap-5">
      <header className="flex flex-col gap-1.5 max-w-2xl">
        {eyebrow ? (
          <span className="text-[10px] tracking-[0.18em] font-semibold uppercase text-accent-cyan-700">
            {eyebrow}
          </span>
        ) : null}
        <h2 className="text-2xl font-semibold text-navy-800 leading-tight">{title}</h2>
        {description ? <p className="text-sm text-navy-600 leading-relaxed">{description}</p> : null}
      </header>
      <div>{children}</div>
    </section>
  )
}

/* ── Color swatch grid ───────────────────────────────────────────────── */
// Hex maps mirror tailwind.config.js. Inlined as `style.background` so the
// swatches don't depend on Tailwind's content-scanner picking up classes
// that are constructed via template-literal interpolation at runtime.
const NAVY_HEX = {
  50: '#F1F5FB', 100: '#DDE7F4', 200: '#B6CAE5', 300: '#88A6CF',
  400: '#5680B3', 500: '#2F5C92', 600: '#1B4477', 700: '#103562',
  800: '#0A2540', 900: '#061830', 950: '#030C1C',
}
const CYAN_HEX = {
  50: '#ECFEFF', 100: '#CFFAFE', 200: '#A5F3FC', 300: '#67E8F9',
  400: '#22D3EE', 500: '#06B6D4', 600: '#0891B2', 700: '#0E7490',
  800: '#155E75', 900: '#164E63', 950: '#083344',
}

function Swatches({ hexMap, label }) {
  const steps = Object.keys(hexMap).map(Number)
  return (
    <div>
      <p className="text-xs font-medium text-navy-600 mb-2">{label}</p>
      <div className="grid grid-cols-11 gap-1.5">
        {steps.map(step => (
          <div key={step} className="flex flex-col items-center gap-1.5">
            <span
              className="w-full aspect-square rounded-lg border border-white/40 shadow-glass-sm"
              style={{ background: hexMap[step] }}
              title={hexMap[step]}
            />
            <span className="text-[10px] font-medium text-navy-600 tabular-nums">{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function DesignSystem({ lang = 'en' }) {
  const isRTL = lang === 'ar'
  const [modalOpen, setModalOpen] = useState(false)
  const [toasts, setToasts]       = useState([])
  const [selectVal, setSelectVal] = useState('molars')
  const [textVal, setTextVal]     = useState('')
  const [errVal, setErrVal]       = useState('not-an-email')

  const fireToast = (type, title, message) =>
    setToasts(t => [...t, { id: Date.now() + Math.random(), type, title, message }])
  const dismissToast = (id) => setToasts(t => t.filter(x => x.id !== id))

  const T = isRTL
    ? {
        eyebrow: 'نظام التصميم',
        h1: 'مكتبة "زجاج سائل" — Velo',
        sub: 'العناصر الأساسية، الألوان، والطباعة لمنتج Velo Dental. هذه الصفحة للمشغّل فقط ولا تظهر للعيادات.',
        sections: {
          colors: { e: 'الألوان', t: 'لوحة الألوان', d: 'الكحلي للهوية، الفيروزي للتمييز.' },
          type:   { e: 'الطباعة', t: 'الطباعة', d: 'Inter للإنجليزية، Tajawal للعربية.' },
          card:   { e: 'البطاقات', t: 'GlassCard', d: 'سطح زجاجي شفاف بثلاث كثافات.' },
          button: { e: 'الأزرار', t: 'Button', d: 'أربع تنويعات وثلاثة أحجام.' },
          input:  { e: 'الإدخال', t: 'Input', d: 'حقل نص بحالاتها المختلفة.' },
          select: { e: 'القائمة', t: 'Select', d: 'قائمة منسدلة.' },
          modal:  { e: 'النوافذ', t: 'Modal', d: 'نافذة فوق خلفية مموهة.' },
          toast:  { e: 'التنبيهات', t: 'Toast', d: 'إشعارات منزلقة.' },
          badge:  { e: 'الشارات', t: 'Badge', d: 'مؤشرات حالة صغيرة.' },
          avatar: { e: 'الصور الرمزية', t: 'Avatar', d: 'دائرة صورة أو الأحرف الأولى.' },
          empty:  { e: 'حالات فارغة', t: 'EmptyState', d: 'تخطيط للشاشات الفارغة.' },
          skel:   { e: 'التحميل', t: 'SkeletonGlass', d: 'هيكل تحميل نابض.' },
        },
      }
    : {
        eyebrow: 'Design system',
        h1: 'Liquid Glass primitives — Velo',
        sub: 'Foundation tokens, colors, typography, and primitives for Velo Dental. Operator-only — clinic users never see this page.',
        sections: {
          colors: { e: 'Color', t: 'Palette', d: 'Navy carries the brand. Cyan accents key actions.' },
          type:   { e: 'Type', t: 'Typography', d: 'Inter for Latin, Tajawal for Arabic copy.' },
          card:   { e: 'Surface', t: 'GlassCard', d: 'Frosted-glass surface in three opacity tiers.' },
          button: { e: 'Action', t: 'Button', d: 'Four variants × three sizes, plus loading and disabled.' },
          input:  { e: 'Field', t: 'Input', d: 'Top label, leading icon, error, password reveal.' },
          select: { e: 'Field', t: 'Select', d: 'Native select wrapped in the glass field treatment.' },
          modal:  { e: 'Overlay', t: 'Modal', d: 'Glass card centered over a blurred backdrop.' },
          toast:  { e: 'Feedback', t: 'Toast', d: 'Slides in from the inline-end edge; auto-dismisses.' },
          badge:  { e: 'Status', t: 'Badge', d: 'Pill for status, role, count. Tone × size variants.' },
          avatar: { e: 'Identity', t: 'Avatar', d: 'Circular image with deterministic gradient fallback.' },
          empty:  { e: 'Layout', t: 'EmptyState', d: 'Illustration + heading + body + optional action.' },
          skel:   { e: 'Loading', t: 'SkeletonGlass', d: 'Pulsing translucent placeholder for glass surfaces.' },
        },
      }

  return (
    <div className="ds-root min-h-screen w-full overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Ambient gradient halo behind the page */}
      <div className="relative">
        <div className="ds-ambient" />
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16 flex flex-col gap-16">

          {/* Page header */}
          <header className="flex flex-col gap-3 max-w-3xl">
            <span className="text-[10px] tracking-[0.18em] font-semibold uppercase text-accent-cyan-700">
              {T.eyebrow}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-navy-800 leading-[1.05] tracking-tight">
              {T.h1}
            </h1>
            <p className="text-base text-navy-600 leading-relaxed">{T.sub}</p>
          </header>

          {/* 1. Colors */}
          <Section id="colors" eyebrow={T.sections.colors.e} title={T.sections.colors.t} description={T.sections.colors.d}>
            <GlassCard padding="lg" className="flex flex-col gap-6">
              <Swatches hexMap={NAVY_HEX} label="navy" />
              <Swatches hexMap={CYAN_HEX} label="accent-cyan" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { name: 'glass.bg-soft',   cls: 'bg-glass-bg-soft' },
                  { name: 'glass.bg',        cls: 'bg-glass-bg' },
                  { name: 'glass.bg-strong', cls: 'bg-glass-bg-strong' },
                  { name: 'glass.bg-tinted', cls: 'bg-glass-bg-tinted' },
                ].map(s => (
                  <div key={s.name} className="flex flex-col items-center gap-2">
                    <div className={['w-full h-16 rounded-glass border border-white/40 shadow-glass-sm', s.cls].join(' ')} />
                    <span className="text-[11px] font-medium text-navy-700">{s.name}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </Section>

          {/* 2. Typography */}
          <Section id="type" eyebrow={T.sections.type.e} title={T.sections.type.t} description={T.sections.type.d}>
            <GlassCard padding="lg" className="grid md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-4">
                <p className="text-[10px] uppercase tracking-widest text-navy-500">English · Inter</p>
                <h1 className="text-5xl font-bold text-navy-800 leading-tight tracking-tight">Display 5xl</h1>
                <h2 className="text-3xl font-semibold text-navy-800 leading-tight">Heading 3xl</h2>
                <h3 className="text-xl font-semibold text-navy-700">Heading xl</h3>
                <p className="text-base text-navy-700 leading-relaxed">
                  Body — quiet confidence in every screen the dentist sees.
                </p>
                <p className="text-sm text-navy-600">Small — meta and helper copy.</p>
                <p className="text-[11px] uppercase tracking-widest text-navy-500 font-semibold">Caption</p>
              </div>
              <div className="flex flex-col gap-4 font-ar" dir="rtl">
                <p className="text-[10px] uppercase tracking-widest text-navy-500">العربية · Tajawal</p>
                <h1 className="text-5xl font-bold text-navy-800 leading-tight">عنوان كبير</h1>
                <h2 className="text-3xl font-semibold text-navy-800">عنوان متوسط</h2>
                <h3 className="text-xl font-semibold text-navy-700">عنوان فرعي</h3>
                <p className="text-base text-navy-700 leading-relaxed">
                  نص أساسي — لغة هادئة وموثوقة في كل شاشة يراها طبيب الأسنان.
                </p>
                <p className="text-sm text-navy-600">نص صغير — توضيحات وحواشي.</p>
                <p className="text-[11px] uppercase tracking-widest text-navy-500 font-semibold">تعليق</p>
              </div>
            </GlassCard>
          </Section>

          {/* 3. GlassCard */}
          <Section id="card" eyebrow={T.sections.card.e} title={T.sections.card.t} description={T.sections.card.d}>
            <div className="grid sm:grid-cols-3 gap-4">
              <GlassCard padding="md" tone="soft">
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-2">soft · 55%</p>
                <p className="text-sm text-navy-700">Lower opacity for hero surfaces over busy backgrounds.</p>
              </GlassCard>
              <GlassCard padding="md">
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-2">default · 70%</p>
                <p className="text-sm text-navy-700">Workhorse card. Default for most content surfaces.</p>
              </GlassCard>
              <GlassCard padding="md" tone="strong">
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-2">strong · 85%</p>
                <p className="text-sm text-navy-700">Use for popovers and dropdowns where legibility wins.</p>
              </GlassCard>
            </div>
          </Section>

          {/* 4. Button */}
          <Section id="button" eyebrow={T.sections.button.e} title={T.sections.button.t} description={T.sections.button.d}>
            <GlassCard padding="lg" className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">     Schedule appointment </Button>
                <Button variant="secondary">   View patient        </Button>
                <Button variant="ghost">       Cancel              </Button>
                <Button variant="destructive"> Delete record       </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="sm">Small</Button>
                <Button variant="primary" size="md">Medium</Button>
                <Button variant="primary" size="lg">Large</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary"   iconStart={PlusIcon}>     New patient </Button>
                <Button variant="secondary" iconEnd={ArrowRight}>     Continue    </Button>
                <Button variant="ghost"     iconStart={SearchIcon}>   Search      </Button>
                <Button variant="primary"   loading>                  Saving…     </Button>
                <Button variant="primary"   disabled>                 Disabled    </Button>
              </div>
            </GlassCard>
          </Section>

          {/* 5. Input */}
          <Section id="input" eyebrow={T.sections.input.e} title={T.sections.input.t} description={T.sections.input.d}>
            <GlassCard padding="lg" className="grid sm:grid-cols-2 gap-5">
              <Input
                label="Patient name"
                placeholder="e.g. Ali Hassan"
                value={textVal}
                onChange={e => setTextVal(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                iconStart={MailIcon}
                placeholder="name@clinic.iq"
              />
              <Input
                label="Email (error)"
                type="email"
                iconStart={MailIcon}
                value={errVal}
                onChange={e => setErrVal(e.target.value)}
                error={errVal && !errVal.includes('@') ? 'Enter a valid email' : undefined}
              />
              <Input label="Password" type="password" placeholder="••••••••" />
              <Input label="Disabled" placeholder="—" disabled />
              <Input
                label="With helper"
                placeholder="Patient phone"
                helper="Iraqi mobile format: 07XX XXX XXXX"
              />
            </GlassCard>
          </Section>

          {/* 6. Select */}
          <Section id="select" eyebrow={T.sections.select.e} title={T.sections.select.t} description={T.sections.select.d}>
            <GlassCard padding="lg" className="grid sm:grid-cols-2 gap-5">
              <Select
                label="Treatment area"
                value={selectVal}
                onChange={e => setSelectVal(e.target.value)}
                options={[
                  { value: 'molars',    label: 'Molars'    },
                  { value: 'incisors',  label: 'Incisors'  },
                  { value: 'canines',   label: 'Canines'   },
                  { value: 'premolars', label: 'Premolars' },
                ]}
              />
              <Select
                label="Doctor"
                placeholder="Select a doctor"
                helper="Owners and doctors both appear here."
                options={[
                  { value: 'd1', label: 'Dr. Saif AlShaker' },
                  { value: 'd2', label: 'Dr. Lana Hawrami' },
                ]}
              />
              <Select
                label="Status"
                defaultValue="confirmed"
                options={[
                  { value: 'pending',   label: 'Pending'   },
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
              <Select label="Disabled" disabled placeholder="—" options={[]} />
            </GlassCard>
          </Section>

          {/* 7. Modal */}
          <Section id="modal" eyebrow={T.sections.modal.e} title={T.sections.modal.t} description={T.sections.modal.d}>
            <GlassCard padding="lg" className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                Open sample modal
              </Button>
              <p className="text-sm text-navy-600">Closes on Escape, backdrop click, or the close button.</p>
            </GlassCard>
            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              title="Confirm appointment"
              size="md"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                  <Button variant="primary" onClick={() => setModalOpen(false)}>Confirm</Button>
                </>
              }
            >
              <p>
                You're about to schedule a follow-up for <strong>Ali Hassan</strong> on
                <strong> Tuesday, May 5, 10:30 AM</strong>. The patient will receive a WhatsApp
                reminder 24 hours before.
              </p>
            </Modal>
          </Section>

          {/* 8. Toast */}
          <Section id="toast" eyebrow={T.sections.toast.e} title={T.sections.toast.t} description={T.sections.toast.d}>
            <GlassCard padding="lg" className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => fireToast('success', 'Appointment saved', 'Tuesday, 10:30 AM with Dr. Saif')}>Success</Button>
              <Button variant="secondary" onClick={() => fireToast('info',    'Reminder queued',   'Patient will be notified 24h before')}>Info</Button>
              <Button variant="secondary" onClick={() => fireToast('warning', 'Slot conflict',     'Another appointment overlaps this time')}>Warning</Button>
              <Button variant="secondary" onClick={() => fireToast('error',   'Save failed',       'Network unreachable. Retry?')}>Error</Button>
            </GlassCard>
            <ToastContainer>
              {toasts.map(t => (
                <Toast
                  key={t.id}
                  type={t.type}
                  title={t.title}
                  message={t.message}
                  onClose={() => dismissToast(t.id)}
                  autoDismiss={4500}
                />
              ))}
            </ToastContainer>
          </Section>

          {/* 9. Badge */}
          <Section id="badge" eyebrow={T.sections.badge.e} title={T.sections.badge.t} description={T.sections.badge.d}>
            <GlassCard padding="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone="navy"    dot>Owner</Badge>
                <Badge tone="cyan"    dot>Doctor</Badge>
                <Badge tone="success" dot>Completed</Badge>
                <Badge tone="warning" dot>Pending</Badge>
                <Badge tone="danger"  dot>Overdue</Badge>
                <Badge tone="neutral">Draft</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="solid-navy">    Live   </Badge>
                <Badge tone="solid-success"> Paid   </Badge>
                <Badge tone="solid-danger">  Past due </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge size="sm" tone="navy">Sm</Badge>
                <Badge size="md" tone="navy">Md</Badge>
              </div>
            </GlassCard>
          </Section>

          {/* 10. Avatar */}
          <Section id="avatar" eyebrow={T.sections.avatar.e} title={T.sections.avatar.t} description={T.sections.avatar.d}>
            <GlassCard padding="lg" className="flex flex-col gap-5">
              <div className="flex items-end flex-wrap gap-3">
                <Avatar size="xs" name="Saif AlShaker" />
                <Avatar size="sm" name="Lana Hawrami" />
                <Avatar size="md" name="Yusuf Barzani" />
                <Avatar size="lg" name="Ali Hassan" />
                <Avatar size="xl" name="Sara Karimi" />
              </div>
              <div className="flex items-center gap-3">
                <Avatar size="md" src="https://i.pravatar.cc/96?img=12" name="With image" alt="Sample avatar" />
                <Avatar size="md" src="https://invalid.example/x.png" name="Broken Image" alt="Fallback" />
                <span className="text-xs text-navy-600">First loads, second falls back to initials.</span>
              </div>
            </GlassCard>
          </Section>

          {/* 11. EmptyState */}
          <Section id="empty" eyebrow={T.sections.empty.e} title={T.sections.empty.t} description={T.sections.empty.d}>
            <GlassCard padding="lg">
              <EmptyState
                title="No appointments yet"
                description="When you schedule an appointment, it'll appear here. Patients receive a WhatsApp reminder 24 hours in advance."
                action={<Button variant="primary" iconStart={PlusIcon}>New appointment</Button>}
              />
            </GlassCard>
          </Section>

          {/* 12. SkeletonGlass */}
          <Section id="skeleton" eyebrow={T.sections.skel.e} title={T.sections.skel.t} description={T.sections.skel.d}>
            <div className="grid md:grid-cols-2 gap-4">
              <SkeletonGlassCard />
              <GlassCard padding="lg" className="space-y-3">
                <SkeletonGlass shape="title" className="w-1/2" />
                <SkeletonGlass shape="text"  className="w-full" />
                <SkeletonGlass shape="text"  className="w-5/6" />
                <SkeletonGlass shape="block" className="w-full mt-2" />
              </GlassCard>
            </div>
          </Section>

          <footer className="pt-8 border-t border-navy-100/60 text-center">
            <p className="text-xs text-navy-500">
              Velo CRM · Liquid Glass design system · Sprint 1 Phase 1.1
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}
