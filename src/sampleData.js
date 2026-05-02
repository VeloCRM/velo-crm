// Velo CRM - Sample Data

export const SAMPLE_CONTACTS = [
  {
    id: 'c1',
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@nexacorp.com',
    phone: '+1 (415) 555-0192',
    company: 'Nexa Corp',
    category: 'client',
    city: 'San Francisco',
    status: 'active',
    tags: ['enterprise', 'renewal'],
    source: 'referral',
    notes: 'Key decision maker. Prefers email communication. Renewal due Q3.',
    createdAt: '2026-01-15',
    documents: [],
    notesTimeline: [
      { id: 'n1', text: 'Initial meeting — discussed enterprise needs', date: '2026-01-15', author: 'Admin User' },
      { id: 'n2', text: 'Sent proposal for Enterprise plan renewal', date: '2026-02-20', author: 'Admin User' },
      { id: 'n3', text: 'Call scheduled for contract negotiation', date: '2026-03-28', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah1', type: 'email', text: 'Email sent: Contract Renewal Terms', date: '2026-04-03' },
      { id: 'ah2', type: 'call', text: 'Outbound call (12 min)', date: '2026-03-28' },
      { id: 'ah3', type: 'deal', text: 'Deal updated: Nexa Corp Enterprise Renewal', date: '2026-03-15' },
      { id: 'ah4', type: 'note', text: 'Added note about renewal timeline', date: '2026-02-20' },
    ],
  },
  {
    id: 'c2',
    name: 'James Thornton',
    email: 'j.thornton@prismventures.io',
    phone: '+1 (212) 555-0847',
    company: 'Prism Ventures',
    category: 'prospect',
    city: 'New York',
    status: 'lead',
    tags: ['saas-summit', 'high-value'],
    source: 'event',
    notes: 'Met at SaaS Summit. Interested in Enterprise plan. Follow up in 2 weeks.',
    createdAt: '2026-02-03',
    documents: [],
    notesTimeline: [
      { id: 'n4', text: 'Met at SaaS Summit NYC — strong interest in Enterprise plan', date: '2026-02-03', author: 'Admin User' },
      { id: 'n5', text: 'Sent follow-up email with pricing deck', date: '2026-02-10', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah5', type: 'email', text: 'Email received: Proposal Questions', date: '2026-04-03' },
      { id: 'ah6', type: 'meeting', text: 'SaaS Summit introduction meeting', date: '2026-02-03' },
    ],
  },
  {
    id: 'c3',
    name: 'Aisha Rahman',
    email: 'aisha@bridgepartners.ae',
    phone: '+971 50 555 1234',
    company: 'Bridge Partners',
    category: 'partner',
    city: 'Dubai',
    status: 'active',
    tags: ['mena', 'co-marketing'],
    source: 'partnership',
    notes: 'Regional partner for MENA market. Co-marketing agreement signed.',
    createdAt: '2026-01-28',
    documents: [],
    notesTimeline: [
      { id: 'n6', text: 'Partnership agreement signed for MENA region', date: '2026-01-28', author: 'Admin User' },
      { id: 'n7', text: 'Co-marketing campaign launched', date: '2026-03-01', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah7', type: 'email', text: 'Email received: MENA Partnership Update', date: '2026-04-02' },
      { id: 'ah8', type: 'deal', text: 'Deal created: Bridge Partners Co-Sell Deal', date: '2026-03-10' },
    ],
  },
  {
    id: 'c4',
    name: 'Carlos Mendez',
    email: 'carlos.mendez@apexsupply.com',
    phone: '+1 (305) 555-0374',
    company: 'Apex Supply Co.',
    category: 'supplier',
    city: 'Miami',
    status: 'inactive',
    tags: ['hardware', 'net-30'],
    source: 'website',
    notes: 'Hardware vendor. Net-30 payment terms. Quality rating: 4.8/5.',
    createdAt: '2026-02-19',
    documents: [],
    notesTimeline: [
      { id: 'n8', text: 'Vendor onboarded — hardware supplies for office', date: '2026-02-19', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah9', type: 'deal', text: 'Deal lost: Apex Supply SaaS Tools', date: '2026-03-15' },
      { id: 'ah10', type: 'email', text: 'Email sent: Vendor agreement', date: '2026-02-19' },
    ],
  },
  {
    id: 'c5',
    name: 'Elena Vasquez',
    email: 'elena.v@cloudstrategies.com',
    phone: '+1 (628) 555-0091',
    company: 'Cloud Strategies LLC',
    category: 'client',
    city: 'Austin',
    status: 'active',
    tags: ['analytics', 'crm-module'],
    source: 'inbound',
    notes: 'Onboarded March 2026. Using Analytics + CRM modules. Very satisfied.',
    createdAt: '2026-03-05',
    documents: [],
    notesTimeline: [
      { id: 'n9', text: 'Onboarding complete — Analytics + CRM modules active', date: '2026-03-05', author: 'Admin User' },
      { id: 'n10', text: 'Kick-off call scheduled for April 5', date: '2026-03-31', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah11', type: 'deal', text: 'Deal won: Cloud Strategies Analytics Module ($9,600)', date: '2026-03-31' },
      { id: 'ah12', type: 'call', text: 'Onboarding call (45 min)', date: '2026-03-05' },
    ],
  },
  {
    id: 'c6',
    name: 'David Park',
    email: 'dpark@koreinnovate.kr',
    phone: '+82 2 555 9988',
    company: 'Kore Innovate',
    category: 'prospect',
    city: 'Seoul',
    status: 'lead',
    tags: ['apac', 'enterprise'],
    source: 'outbound',
    notes: 'APAC expansion opportunity. Demo scheduled for April 10.',
    createdAt: '2026-03-22',
    documents: [],
    notesTimeline: [
      { id: 'n11', text: 'Initial outreach — APAC expansion target', date: '2026-03-22', author: 'Admin User' },
      { id: 'n12', text: 'Technical requirements received', date: '2026-04-01', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah13', type: 'email', text: 'Email received: Technical Requirements', date: '2026-04-01' },
      { id: 'ah14', type: 'call', text: 'Discovery call (30 min)', date: '2026-03-22' },
    ],
  },
  {
    id: 'c7',
    name: 'Lisa Chen',
    email: 'lisa.chen@quantumleap.io',
    phone: '+1 (650) 555-0233',
    company: 'Quantum Leap Inc',
    category: 'prospect',
    city: 'Palo Alto',
    status: 'lead',
    tags: ['startup', 'series-b'],
    source: 'linkedin',
    notes: 'Series B startup. Evaluating CRM solutions for growing sales team.',
    createdAt: '2026-03-28',
    documents: [],
    notesTimeline: [
      { id: 'n13', text: 'Connected via LinkedIn — Series B startup looking for CRM', date: '2026-03-28', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah15', type: 'email', text: 'Email sent: Intro and pricing overview', date: '2026-03-29' },
    ],
  },
  {
    id: 'c8',
    name: 'Omar Al-Rashid',
    email: 'omar@gulftech.sa',
    phone: '+966 55 555 7890',
    company: 'Gulf Tech Solutions',
    category: 'client',
    city: 'Riyadh',
    status: 'active',
    tags: ['enterprise', 'mena'],
    source: 'referral',
    notes: 'Referred by Aisha Rahman. Enterprise client in Saudi market.',
    createdAt: '2026-02-10',
    documents: [],
    notesTimeline: [
      { id: 'n14', text: 'Referral from Bridge Partners — Aisha Rahman', date: '2026-02-10', author: 'Admin User' },
      { id: 'n15', text: 'Contract signed for Enterprise plan', date: '2026-03-01', author: 'Admin User' },
    ],
    activityHistory: [
      { id: 'ah16', type: 'deal', text: 'Enterprise plan activated', date: '2026-03-01' },
      { id: 'ah17', type: 'call', text: 'Onboarding call (35 min)', date: '2026-03-02' },
    ],
  },
]

export const SAMPLE_DEALS = [
  {
    id: 'd1',
    name: 'Nexa Corp — Enterprise Renewal',
    contactId: 'c1',
    contact: 'Sarah Mitchell',
    company: 'Nexa Corp',
    value: 48000,
    stage: 'negotiation',
    probability: 75,
    closeDate: '2026-04-30',
    createdAt: '2026-02-15',
    notes: 'Multi-year contract negotiation. Price sensitivity on seat count.',
  },
  {
    id: 'd2',
    name: 'Prism Ventures — Growth Plan',
    contactId: 'c2',
    contact: 'James Thornton',
    company: 'Prism Ventures',
    value: 18000,
    stage: 'proposal',
    probability: 50,
    closeDate: '2026-05-15',
    createdAt: '2026-03-01',
    notes: 'Sent proposal deck. Awaiting board approval.',
  },
  {
    id: 'd3',
    name: 'Cloud Strategies — Analytics Module',
    contactId: 'c5',
    contact: 'Elena Vasquez',
    company: 'Cloud Strategies LLC',
    value: 9600,
    stage: 'won',
    probability: 100,
    closeDate: '2026-03-31',
    createdAt: '2026-02-20',
    notes: 'Closed! Annual subscription. Kick-off call April 5.',
  },
  {
    id: 'd4',
    name: 'Kore Innovate — APAC License',
    contactId: 'c6',
    contact: 'David Park',
    company: 'Kore Innovate',
    value: 32000,
    stage: 'qualified',
    probability: 35,
    closeDate: '2026-06-30',
    createdAt: '2026-03-25',
    notes: 'Technical requirements review completed. Budget approved.',
  },
  {
    id: 'd5',
    name: 'Bridge Partners — Co-Sell Deal',
    contactId: 'c3',
    contact: 'Aisha Rahman',
    company: 'Bridge Partners',
    value: 24000,
    stage: 'lead',
    probability: 20,
    closeDate: '2026-07-15',
    createdAt: '2026-03-10',
    notes: 'Referral from existing partner. Initial contact made.',
  },
  {
    id: 'd6',
    name: 'Apex Supply — SaaS Tools',
    contactId: 'c4',
    contact: 'Carlos Mendez',
    company: 'Apex Supply Co.',
    value: 6000,
    stage: 'lost',
    probability: 0,
    closeDate: '2026-03-15',
    createdAt: '2026-01-20',
    notes: 'Went with competitor. Budget constraints cited.',
  },
  {
    id: 'd7',
    name: 'Quantum Leap — Starter Package',
    contactId: 'c7',
    contact: 'Lisa Chen',
    company: 'Quantum Leap Inc',
    value: 14400,
    stage: 'lead',
    probability: 15,
    closeDate: '2026-08-01',
    createdAt: '2026-03-29',
    notes: 'Initial conversation. Evaluating against 2 competitors.',
  },
  {
    id: 'd8',
    name: 'Gulf Tech — Enterprise Expansion',
    contactId: 'c8',
    contact: 'Omar Al-Rashid',
    company: 'Gulf Tech Solutions',
    value: 56000,
    stage: 'won',
    probability: 100,
    closeDate: '2026-03-01',
    createdAt: '2026-02-10',
    notes: 'Full enterprise deployment for Saudi operations.',
  },
]

export const SAMPLE_TASKS = [
  {
    id: 't1',
    title: 'Follow up with James Thornton on proposal',
    done: false,
    priority: 'high',
    dueDate: '2026-04-03',
    contact: 'James Thornton',
  },
  {
    id: 't2',
    title: 'Prepare Q2 pipeline review presentation',
    done: false,
    priority: 'high',
    dueDate: '2026-04-03',
    contact: null,
  },
  {
    id: 't3',
    title: 'Send onboarding docs to Cloud Strategies',
    done: true,
    priority: 'medium',
    dueDate: '2026-04-03',
    contact: 'Elena Vasquez',
  },
  {
    id: 't4',
    title: 'Schedule demo call with David Park',
    done: false,
    priority: 'medium',
    dueDate: '2026-04-03',
    contact: 'David Park',
  },
  {
    id: 't5',
    title: 'Update CRM notes after Nexa call',
    done: true,
    priority: 'low',
    dueDate: '2026-04-03',
    contact: 'Sarah Mitchell',
  },
]

export const SAMPLE_MESSAGES = [
  {
    id: 'm1',
    from: 'Sarah Mitchell',
    fromEmail: 'sarah.mitchell@nexacorp.com',
    subject: 'Re: Contract Renewal Terms',
    preview: "Hi, thanks for the updated proposal. I've reviewed it with our legal team and...",
    body: "Hi,\n\nThanks for the updated proposal. I've reviewed it with our legal team and we have a few amendments to discuss. Can we schedule a call this week?\n\nMy preferred times are:\n- Tuesday 2:00 PM PST\n- Wednesday 10:00 AM PST\n- Thursday 3:00 PM PST\n\nLooking forward to closing this out.\n\nBest,\nSarah",
    time: '10:42 AM',
    date: '2026-04-03',
    read: false,
  },
  {
    id: 'm2',
    from: 'James Thornton',
    fromEmail: 'j.thornton@prismventures.io',
    subject: 'Proposal Questions',
    preview: "Quick question about the pricing tiers in section 3. Are there volume discounts available for...",
    body: "Hi,\n\nQuick question about the pricing tiers in section 3. Are there volume discounts available for teams over 50 seats? Our board is asking specifically about this.\n\nAlso, can you clarify the SLA uptime guarantees?\n\nThanks,\nJames",
    time: '9:15 AM',
    date: '2026-04-03',
    read: false,
  },
  {
    id: 'm3',
    from: 'Aisha Rahman',
    fromEmail: 'aisha@bridgepartners.ae',
    subject: 'MENA Partnership Update — Q2 Goals',
    preview: "Wanted to share our Q2 targets for the MENA region. We're projecting 3 new enterprise clients...",
    body: "Hello,\n\nWanted to share our Q2 targets for the MENA region. We're projecting 3 new enterprise clients from UAE and Saudi Arabia based on our pipeline.\n\nKey events this quarter:\n- Dubai Tech Summit (April 18-20)\n- Riyadh Innovation Forum (May 8)\n\nShall we coordinate our presence?\n\nWarm regards,\nAisha",
    time: 'Yesterday',
    date: '2026-04-02',
    read: true,
  },
  {
    id: 'm4',
    from: 'David Park',
    fromEmail: 'dpark@koreinnovate.kr',
    subject: 'Technical Requirements — APAC License',
    preview: "Our IT team has completed the infrastructure assessment. Here's a summary of our technical requirements...",
    body: "Hi,\n\nOur IT team has completed the infrastructure assessment. Here's a summary of our technical requirements:\n\n1. Single Sign-On (SSO) via Azure AD\n2. Data residency in Singapore region\n3. API rate limits above 10k requests/day\n4. Custom branding support\n\nCan you confirm Velo supports all of the above?\n\nBest,\nDavid",
    time: 'Apr 1',
    date: '2026-04-01',
    read: true,
  },
]

export const SAMPLE_APPOINTMENTS = [
  {
    id: 'a1',
    title: 'Contract Negotiation Call — Nexa Corp',
    date: '2026-04-03',
    time: '14:00',
    type: 'call',
    contact: 'Sarah Mitchell',
    notes: 'Discuss amendment terms. Have legal docs ready.',
  },
  {
    id: 'a2',
    title: 'Product Demo — Kore Innovate',
    date: '2026-04-10',
    time: '10:00',
    type: 'demo',
    contact: 'David Park',
    notes: 'APAC market demo. Emphasize SSO and data residency features.',
  },
  {
    id: 'a3',
    title: 'QBR — Cloud Strategies',
    date: '2026-04-15',
    time: '11:00',
    type: 'meeting',
    contact: 'Elena Vasquez',
    notes: 'Quarterly business review. Prepare ROI report.',
  },
  {
    id: 'a4',
    title: 'Partner Sync — Bridge Partners',
    date: '2026-04-18',
    time: '15:30',
    type: 'meeting',
    contact: 'Aisha Rahman',
    notes: 'Align on Dubai Tech Summit strategy.',
  },
  {
    id: 'a5',
    title: 'Discovery Call — Prism Ventures',
    date: '2026-04-22',
    time: '09:00',
    type: 'call',
    contact: 'James Thornton',
    notes: 'Board has approved budget exploration. Great opportunity.',
  },
]

export const SAMPLE_CONVERSATIONS = [
  {
    id: 'conv1',
    contactId: 'c1',
    contactName: 'Sarah Mitchell',
    company: 'Nexa Corp',
    channel: 'email',
    status: 'online',
    unread: 2,
    lastMessage: "I've reviewed the proposal with our legal team. Can we schedule a call?",
    lastTime: '10:42 AM',
    messages: [
      { id: 'msg1', sender: 'them', text: 'Hi, I wanted to follow up on the renewal proposal you sent last week.', time: '9:30 AM', date: '2026-04-02' },
      { id: 'msg2', sender: 'me', text: 'Hi Sarah! Of course. We updated the pricing to reflect the multi-year discount we discussed. Let me know if the terms work.', time: '10:15 AM', date: '2026-04-02' },
      { id: 'msg3', sender: 'them', text: 'Thanks! I\'ll share it with our legal team today and get back to you.', time: '11:00 AM', date: '2026-04-02' },
      { id: 'msg4', sender: 'me', text: 'Perfect. Take your time — happy to hop on a call if any questions come up.', time: '11:05 AM', date: '2026-04-02' },
      { id: 'msg5', sender: 'them', text: "I've reviewed the proposal with our legal team. We have a few amendments to discuss.", time: '10:30 AM', date: '2026-04-03' },
      { id: 'msg6', sender: 'them', text: 'Can we schedule a call this week? My preferred times are Tuesday 2PM or Wednesday 10AM PST.', time: '10:42 AM', date: '2026-04-03' },
    ],
  },
  {
    id: 'conv2',
    contactId: 'c2',
    contactName: 'James Thornton',
    company: 'Prism Ventures',
    channel: 'whatsapp',
    status: 'online',
    unread: 1,
    lastMessage: 'Quick question about the pricing tiers — are there volume discounts for 50+ seats?',
    lastTime: '9:15 AM',
    messages: [
      { id: 'msg7', sender: 'me', text: 'Hi James! Great meeting you at the SaaS Summit. As promised, here\'s the proposal deck for the Growth Plan.', time: '2:00 PM', date: '2026-03-30' },
      { id: 'msg8', sender: 'them', text: 'Thanks! I\'ll review it over the weekend with our CTO.', time: '2:15 PM', date: '2026-03-30' },
      { id: 'msg9', sender: 'them', text: 'Hey, we went through the proposal. Looks solid overall. 👍', time: '9:00 AM', date: '2026-04-03' },
      { id: 'msg10', sender: 'them', text: 'Quick question about the pricing tiers — are there volume discounts for 50+ seats?', time: '9:15 AM', date: '2026-04-03' },
    ],
  },
  {
    id: 'conv3',
    contactId: 'c3',
    contactName: 'Aisha Rahman',
    company: 'Bridge Partners',
    channel: 'whatsapp',
    status: 'offline',
    unread: 0,
    lastMessage: 'هل يمكننا تنسيق حضورنا في قمة دبي التقنية الشهر القادم؟',
    lastTime: 'Yesterday',
    messages: [
      { id: 'msg11', sender: 'them', text: 'مرحباً! أردت مشاركة أهداف الربع الثاني لمنطقة الشرق الأوسط.', time: '11:00 AM', date: '2026-04-02' },
      { id: 'msg12', sender: 'them', text: 'نتوقع 3 عملاء مؤسسات جدد من الإمارات والسعودية.', time: '11:02 AM', date: '2026-04-02' },
      { id: 'msg13', sender: 'me', text: 'ممتاز يا عائشة! هذا رائع. ما هي الفعاليات القادمة هذا الربع؟', time: '11:30 AM', date: '2026-04-02' },
      { id: 'msg14', sender: 'them', text: 'قمة دبي التقنية (18-20 أبريل) ومنتدى الرياض للابتكار (8 مايو).', time: '11:35 AM', date: '2026-04-02' },
      { id: 'msg15', sender: 'them', text: 'هل يمكننا تنسيق حضورنا في قمة دبي التقنية الشهر القادم؟', time: '11:40 AM', date: '2026-04-02' },
      { id: 'msg16', sender: 'me', text: 'بالتأكيد! سأعد خطة مشتركة وأرسلها لك قبل نهاية الأسبوع.', time: '12:00 PM', date: '2026-04-02' },
    ],
  },
  {
    id: 'conv4',
    contactId: 'c6',
    contactName: 'David Park',
    company: 'Kore Innovate',
    channel: 'email',
    status: 'offline',
    unread: 0,
    lastMessage: 'Can you confirm Velo supports SSO via Azure AD and Singapore data residency?',
    lastTime: 'Apr 1',
    messages: [
      { id: 'msg17', sender: 'me', text: 'Hi David, thanks for your interest in Velo for the APAC region. I\'d love to schedule a demo.', time: '10:00 AM', date: '2026-03-28' },
      { id: 'msg18', sender: 'them', text: 'That sounds great. Before we proceed, our IT team needs to do a technical assessment.', time: '3:00 PM', date: '2026-03-28' },
      { id: 'msg19', sender: 'them', text: 'Our team completed the assessment. Here are our requirements:\n1. SSO via Azure AD\n2. Data residency in Singapore\n3. API rate limits above 10k/day\n4. Custom branding support', time: '11:00 AM', date: '2026-04-01' },
      { id: 'msg20', sender: 'them', text: 'Can you confirm Velo supports SSO via Azure AD and Singapore data residency?', time: '11:05 AM', date: '2026-04-01' },
      { id: 'msg21', sender: 'me', text: 'Absolutely! We support all 4 requirements. I\'ll prepare a technical spec document for your team. The demo on April 10 will cover everything in detail.', time: '2:00 PM', date: '2026-04-01' },
    ],
  },
  {
    id: 'conv5',
    contactId: 'c5',
    contactName: 'Elena Vasquez',
    company: 'Cloud Strategies LLC',
    channel: 'sms',
    status: 'online',
    unread: 1,
    lastMessage: 'Looking forward to the kick-off call tomorrow! Is 10 AM still good?',
    lastTime: '4:30 PM',
    messages: [
      { id: 'msg22', sender: 'me', text: 'Hi Elena! Congrats on getting set up with Velo. Your Analytics + CRM modules are now live. 🎉', time: '9:00 AM', date: '2026-04-02' },
      { id: 'msg23', sender: 'them', text: 'Thank you so much! The team is excited to get started.', time: '9:30 AM', date: '2026-04-02' },
      { id: 'msg24', sender: 'me', text: 'Great to hear! We have your kick-off call scheduled for April 5 at 10 AM. I\'ll send a calendar invite.', time: '10:00 AM', date: '2026-04-02' },
      { id: 'msg25', sender: 'them', text: 'Looking forward to the kick-off call tomorrow! Is 10 AM still good?', time: '4:30 PM', date: '2026-04-03' },
    ],
  },
  {
    id: 'conv6',
    contactId: 'c8',
    contactName: 'Omar Al-Rashid',
    company: 'Gulf Tech Solutions',
    channel: 'whatsapp',
    status: 'online',
    unread: 3,
    lastMessage: 'نحتاج إضافة 20 مستخدم جديد للنظام. هل يمكنكم المساعدة؟',
    lastTime: '11:20 AM',
    messages: [
      { id: 'msg26', sender: 'them', text: 'السلام عليكم، أردت الاستفسار عن إمكانية توسيع الاشتراك.', time: '10:00 AM', date: '2026-04-03' },
      { id: 'msg27', sender: 'them', text: 'فريقنا في الرياض يحتاج وصول إلى النظام أيضاً.', time: '10:05 AM', date: '2026-04-03' },
      { id: 'msg28', sender: 'me', text: 'وعليكم السلام يا عمر! بالتأكيد يمكننا توسيع الاشتراك. كم عدد المستخدمين الإضافيين المطلوبين؟', time: '10:30 AM', date: '2026-04-03' },
      { id: 'msg29', sender: 'them', text: 'نحتاج إضافة 20 مستخدم جديد للنظام. هل يمكنكم المساعدة؟', time: '11:20 AM', date: '2026-04-03' },
    ],
  },
  {
    id: 'conv7',
    contactId: 'c7',
    contactName: 'Lisa Chen',
    company: 'Quantum Leap Inc',
    channel: 'facebook',
    status: 'offline',
    unread: 0,
    lastMessage: 'We saw your post about the new AI features. Very interested! Can we get a demo?',
    lastTime: 'Apr 1',
    messages: [
      { id: 'msg30', sender: 'them', text: 'Hi! We saw your post about the new AI features in Velo CRM. Very interested!', time: '3:00 PM', date: '2026-04-01' },
      { id: 'msg31', sender: 'them', text: 'We\'re a Series B startup looking to scale our sales operations. Can we get a demo?', time: '3:02 PM', date: '2026-04-01' },
      { id: 'msg32', sender: 'me', text: 'Hi Lisa! Thanks for reaching out. We\'d love to show you what Velo can do for a growing team like yours.', time: '4:00 PM', date: '2026-04-01' },
      { id: 'msg33', sender: 'me', text: 'I\'ll send you a booking link for a personalized demo. What day works best next week?', time: '4:01 PM', date: '2026-04-01' },
      { id: 'msg34', sender: 'them', text: 'Wednesday afternoon would be ideal!', time: '4:30 PM', date: '2026-04-01' },
    ],
  },
  {
    id: 'conv8',
    contactId: 'c4',
    contactName: 'Carlos Mendez',
    company: 'Apex Supply Co.',
    channel: 'instagram',
    status: 'offline',
    unread: 0,
    lastMessage: 'No worries, we understand. Let us know if anything changes in the future.',
    lastTime: 'Mar 20',
    messages: [
      { id: 'msg35', sender: 'them', text: 'Hey, I saw your product update on Instagram. The new dashboard looks amazing!', time: '2:00 PM', date: '2026-03-18' },
      { id: 'msg36', sender: 'me', text: 'Thanks Carlos! We put a lot of work into the redesign. How are things at Apex?', time: '2:30 PM', date: '2026-03-18' },
      { id: 'msg37', sender: 'them', text: 'Going well, but we had to go with a different solution for our SaaS tools. Budget was tight this quarter.', time: '3:00 PM', date: '2026-03-20' },
      { id: 'msg38', sender: 'me', text: 'No worries at all, Carlos. We totally understand. The door is always open if things change!', time: '3:30 PM', date: '2026-03-20' },
      { id: 'msg39', sender: 'them', text: 'No worries, we understand. Let us know if anything changes in the future.', time: '3:35 PM', date: '2026-03-20' },
    ],
  },
]

export const SAMPLE_TICKETS = [
  {
    id: 'tkt1', ticketId: 'VLO-001',
    subject: 'SSO integration not working after Azure AD update',
    description: 'After updating Azure AD configuration, the SSO login flow is returning a 403 error. Users cannot authenticate via corporate credentials. This is blocking the entire APAC team from accessing the system.',
    contactId: 'c6', contactName: 'David Park', company: 'Kore Innovate',
    priority: 'urgent', status: 'open', department: 'technical', assignee: 'Ahmed Hassan',
    conversationId: 'conv4',
    createdAt: '2026-04-03T09:00:00', updatedAt: '2026-04-03T11:30:00',
    timeline: [
      { id: 'tl1', type: 'created', text: 'Ticket created', author: 'Admin User', date: '2026-04-03T09:00:00' },
      { id: 'tl2', type: 'comment', text: 'Investigating the Azure AD configuration. Checking SAML assertions.', author: 'Ahmed Hassan', date: '2026-04-03T09:45:00' },
      { id: 'tl3', type: 'comment', text: 'Found the issue — tenant ID was changed during the update. Working on fix.', author: 'Ahmed Hassan', date: '2026-04-03T11:30:00' },
    ],
  },
  {
    id: 'tkt2', ticketId: 'VLO-002',
    subject: 'Volume discount pricing request for 50+ seats',
    description: 'James Thornton from Prism Ventures is requesting volume discount pricing for teams over 50 seats. Board needs specific pricing tiers before approval.',
    contactId: 'c2', contactName: 'James Thornton', company: 'Prism Ventures',
    priority: 'high', status: 'in_progress', department: 'sales', assignee: 'Sarah Kim',
    conversationId: 'conv2',
    createdAt: '2026-04-03T09:30:00', updatedAt: '2026-04-03T10:15:00',
    timeline: [
      { id: 'tl4', type: 'created', text: 'Ticket created from WhatsApp conversation', author: 'Admin User', date: '2026-04-03T09:30:00' },
      { id: 'tl5', type: 'status', text: 'Status changed: Open → In Progress', author: 'Sarah Kim', date: '2026-04-03T09:45:00' },
      { id: 'tl6', type: 'comment', text: 'Preparing custom pricing sheet with volume tiers. Will send to James by EOD.', author: 'Sarah Kim', date: '2026-04-03T10:15:00' },
    ],
  },
  {
    id: 'tkt3', ticketId: 'VLO-003',
    subject: 'Invoice discrepancy — March billing cycle',
    description: 'Elena reports that the March invoice shows charges for 15 seats but they only have 12 active users. Need to investigate and issue credit.',
    contactId: 'c5', contactName: 'Elena Vasquez', company: 'Cloud Strategies LLC',
    priority: 'medium', status: 'pending', department: 'billing', assignee: 'Maria Lopez',
    conversationId: null,
    createdAt: '2026-04-02T14:00:00', updatedAt: '2026-04-03T08:00:00',
    timeline: [
      { id: 'tl7', type: 'created', text: 'Ticket created', author: 'Admin User', date: '2026-04-02T14:00:00' },
      { id: 'tl8', type: 'comment', text: 'Checked billing system — confirmed 3 deactivated seats were still billed. Preparing credit note.', author: 'Maria Lopez', date: '2026-04-02T16:00:00' },
      { id: 'tl9', type: 'status', text: 'Status changed: Open → Pending', author: 'Maria Lopez', date: '2026-04-03T08:00:00' },
    ],
  },
  {
    id: 'tkt4', ticketId: 'VLO-004',
    subject: 'Request for co-marketing materials — Dubai Tech Summit',
    description: 'Aisha needs branded co-marketing materials for the Dubai Tech Summit booth (April 18-20). Needs banners, flyers, and digital assets.',
    contactId: 'c3', contactName: 'Aisha Rahman', company: 'Bridge Partners',
    priority: 'medium', status: 'resolved', department: 'sales', assignee: 'Sarah Kim',
    conversationId: 'conv3',
    createdAt: '2026-03-28T10:00:00', updatedAt: '2026-04-02T15:00:00',
    timeline: [
      { id: 'tl10', type: 'created', text: 'Ticket created', author: 'Admin User', date: '2026-03-28T10:00:00' },
      { id: 'tl11', type: 'comment', text: 'Design team notified. Materials being prepared.', author: 'Sarah Kim', date: '2026-03-29T09:00:00' },
      { id: 'tl12', type: 'comment', text: 'All materials ready and sent to Aisha via email. Banners ship Monday.', author: 'Sarah Kim', date: '2026-04-02T15:00:00' },
      { id: 'tl13', type: 'status', text: 'Status changed: In Progress → Resolved', author: 'Sarah Kim', date: '2026-04-02T15:00:00' },
    ],
  },
  {
    id: 'tkt5', ticketId: 'VLO-005',
    subject: 'User expansion request — 20 additional seats',
    description: 'Omar Al-Rashid needs 20 new user accounts for the Riyadh team. Enterprise plan expansion.',
    contactId: 'c8', contactName: 'Omar Al-Rashid', company: 'Gulf Tech Solutions',
    priority: 'high', status: 'open', department: 'support', assignee: 'Ahmed Hassan',
    conversationId: 'conv6',
    createdAt: '2026-04-03T11:00:00', updatedAt: '2026-04-03T11:00:00',
    timeline: [
      { id: 'tl14', type: 'created', text: 'Ticket created from WhatsApp conversation', author: 'Admin User', date: '2026-04-03T11:00:00' },
    ],
  },
  {
    id: 'tkt6', ticketId: 'VLO-006',
    subject: 'Data export feature request — CSV reports',
    description: 'Sarah needs the ability to export contact and deal data as CSV files for quarterly board reports. Currently no export option available.',
    contactId: 'c1', contactName: 'Sarah Mitchell', company: 'Nexa Corp',
    priority: 'low', status: 'closed', department: 'support', assignee: 'Ahmed Hassan',
    conversationId: null,
    createdAt: '2026-03-15T10:00:00', updatedAt: '2026-03-25T14:00:00',
    timeline: [
      { id: 'tl15', type: 'created', text: 'Ticket created', author: 'Admin User', date: '2026-03-15T10:00:00' },
      { id: 'tl16', type: 'comment', text: 'Feature added in v2.4 release. CSV export now available in Contacts and Reports.', author: 'Ahmed Hassan', date: '2026-03-25T14:00:00' },
      { id: 'tl17', type: 'status', text: 'Status changed: Open → Closed', author: 'Ahmed Hassan', date: '2026-03-25T14:00:00' },
    ],
  },
]

// ─── Dental clinic (demo mode for industry='dental') ─────────────────────────

// `color` is a demo-only property — real `profiles` rows don't have a color
// column. Pages compute a deterministic color from `id` when it's missing.
export const SAMPLE_DENTAL_DOCTORS = [
  { id: 'doc1', full_name: 'Dr. Ahmed Al-Karim', color: '#4DA6FF', role: 'doctor' },
  { id: 'doc2', full_name: 'Dr. Lana Hawrami',   color: '#A78BFA', role: 'doctor' },
  { id: 'doc3', full_name: 'Dr. Yusuf Barzani',  color: '#9D6F4F', role: 'doctor' },
]

export const SAMPLE_DENTAL_PATIENTS = [
  { id: 'p1',  full_name: 'Layla Hassan',      phone: '+964 770 555 0142', email: 'layla.h@gmail.com',   created_at: '2026-04-26T08:00:00Z' },
  { id: 'p2',  full_name: 'Mohammed Aziz',     phone: '+964 750 555 0287', email: 'm.aziz@outlook.com',  created_at: '2026-04-25T14:30:00Z' },
  { id: 'p3',  full_name: 'Zainab Al-Hashimi', phone: '+964 771 555 0934', email: 'zainab.h@gmail.com',  created_at: '2026-04-24T10:15:00Z' },
  { id: 'p4',  full_name: 'Sirwan Karzan',     phone: '+964 770 555 0521', email: null,                  created_at: '2026-04-23T11:45:00Z' },
  { id: 'p5',  full_name: 'Noor Abdullah',     phone: '+964 750 555 0673', email: 'noor.a@yahoo.com',    created_at: '2026-04-22T09:00:00Z' },
  { id: 'p6',  full_name: 'Hawre Salih',       phone: '+964 751 555 0408', email: null,                  created_at: '2026-04-20T16:20:00Z' },
  { id: 'p7',  full_name: 'Reem Al-Bayati',    phone: '+964 770 555 0795', email: 'reem.b@gmail.com',    created_at: '2026-04-18T13:00:00Z' },
  { id: 'p8',  full_name: 'Karwan Hama',       phone: '+964 750 555 0119', email: 'k.hama@gmail.com',    created_at: '2026-04-15T11:30:00Z' },
  { id: 'p9',  full_name: 'Dilan Mahmoud',     phone: '+964 771 555 0264', email: 'dilan.m@outlook.com', created_at: '2026-04-10T15:45:00Z' },
  { id: 'p10', full_name: 'Yara Saadi',        phone: '+964 750 555 0832', email: null,                  created_at: '2026-04-05T08:30:00Z' },
]

// Template rows with HH:MM timestrings — `scheduled_at` is stamped at runtime
// so the today's view always lands on the actual current date. Pre-ordered
// chronologically to mirror Supabase's order('scheduled_at', asc).
export const SAMPLE_DENTAL_APPOINTMENTS_TODAY = [
  { id: 'apt1', patient_id: 'p1', doctor_id: 'doc1', time: '09:00', duration_minutes: 30, type: 'cleaning',   status: 'completed', notes: 'Routine cleaning + polish' },
  { id: 'apt2', patient_id: 'p2', doctor_id: 'doc2', time: '10:30', duration_minutes: 30, type: 'checkup',    status: 'completed', notes: 'Braces adjustment' },
  { id: 'apt6', patient_id: 'p6', doctor_id: 'doc3', time: '11:00', duration_minutes: 45, type: 'extraction', status: 'cancelled', notes: 'Patient rescheduled' },
  { id: 'apt4', patient_id: 'p4', doctor_id: 'doc3', time: '14:00', duration_minutes: 90, type: 'root_canal', status: 'scheduled', notes: 'Upper-left molar — second visit' },
  { id: 'apt5', patient_id: 'p5', doctor_id: 'doc2', time: '15:30', duration_minutes: 45, type: 'filling',    status: 'scheduled', notes: 'Lower-right composite' },
  { id: 'apt3', patient_id: 'p3', doctor_id: 'doc1', time: '16:45', duration_minutes: 60, type: 'whitening',  status: 'confirmed', notes: 'In-office whitening session' },
]

// IQD amounts in `amount_minor` (whole dinars — Iraqi clinics don't use fils).
// The new payments table records actual collected payments, so all rows here
// represent receipts. The dashboard-side "pending" / "overdue" widgets were
// retired in the schema-rename pass.
export const SAMPLE_DENTAL_PAYMENTS = [
  { id: 'pay1', patient_id: 'p1', amount_minor: 350000,  currency: 'IQD', method: 'cash',     patient_name: 'Layla Hassan' },
  { id: 'pay2', patient_id: 'p3', amount_minor: 1200000, currency: 'IQD', method: 'fib',      patient_name: 'Zainab Al-Hashimi' },
  { id: 'pay3', patient_id: 'p7', amount_minor: 850000,  currency: 'IQD', method: 'zaincash', patient_name: 'Reem Al-Bayati' },
  { id: 'pay4', patient_id: 'p9', amount_minor: 425000,  currency: 'IQD', method: 'cash',     patient_name: 'Dilan Mahmoud' },
]

// Headline counts surfaced on the stat cards
export const SAMPLE_DENTAL_STATS = {
  totalPatients: 247,
  patientsThisMonth: 31,
  activePlans: 5,
}

// ─── Dental week generator (used by AppointmentsPage demo branch) ───────────

// Iraqi week starts Saturday. Map JS day (0=Sun..6=Sat) → Iraqi index (0=Sat..6=Fri).
const _IRAQI_DAY_IDX = [1, 2, 3, 4, 5, 6, 0]
function _iraqiWeekStart(d) {
  const date = new Date(d)
  date.setDate(date.getDate() - _IRAQI_DAY_IDX[date.getDay()])
  date.setHours(0, 0, 0, 0)
  return date
}
function _iraqiDayIndex(d) { return _IRAQI_DAY_IDX[d.getDay()] }

const _patientById = Object.fromEntries(SAMPLE_DENTAL_PATIENTS.map(p => [p.id, p]))

// Non-today template — rows keyed by iraqi day offset (Sat=0..Fri=6).
// At runtime, rows whose offset matches today's iraqi day are filtered out;
// today's slice always comes from SAMPLE_DENTAL_APPOINTMENTS_TODAY (single source of truth).
// Friday (offset 6) intentionally has no rows — Iraqi weekend, clinic closed.
const _DENTAL_WEEK_TEMPLATE = [
  // Sat (offset 0) — 5 apts, weekend-light
  { id: 'wapt-sat-1', dayOffset: 0, patient_id: 'p7',  doctor_id: 'doc2', time: '09:00', duration_minutes: 30, type: 'checkup',    notes: 'Brackets adjustment, monthly' },
  { id: 'wapt-sat-2', dayOffset: 0, patient_id: 'p1',  doctor_id: 'doc1', time: '10:00', duration_minutes: 30, type: 'cleaning',   notes: 'Routine cleaning' },
  { id: 'wapt-sat-3', dayOffset: 0, patient_id: 'p9',  doctor_id: 'doc2', time: '11:30', duration_minutes: 30, type: 'checkup',    notes: 'Ortho follow-up — month 4 of 12' },
  { id: 'wapt-sat-4', dayOffset: 0, patient_id: 'p4',  doctor_id: 'doc3', time: '14:30', duration_minutes: 90, type: 'root_canal', notes: 'Pulp removal — session 1' },
  { id: 'wapt-sat-5', dayOffset: 0, patient_id: 'p2',  doctor_id: 'doc2', time: '16:00', duration_minutes: 30, type: 'checkup',    notes: 'Ortho follow-up' },
  // Sun (offset 1) — 6 apts (skipped if today is Sun, replaced by TODAY's 6)
  { id: 'wapt-sun-1', dayOffset: 1, patient_id: 'p10', doctor_id: 'doc1', time: '09:00', duration_minutes: 30, type: 'cleaning',     notes: 'Pre-procedure cleaning' },
  { id: 'wapt-sun-2', dayOffset: 1, patient_id: 'p7',  doctor_id: 'doc2', time: '10:30', duration_minutes: 30, type: 'checkup',      notes: 'Ortho weekly follow-up' },
  { id: 'wapt-sun-3', dayOffset: 1, patient_id: 'p3',  doctor_id: 'doc1', time: '11:30', duration_minutes: 60, type: 'whitening',    notes: 'Whitening — session 1' },
  { id: 'wapt-sun-4', dayOffset: 1, patient_id: 'p8',  doctor_id: 'doc3', time: '14:00', duration_minutes: 60, type: 'crown',        notes: 'Crown placement' },
  { id: 'wapt-sun-5', dayOffset: 1, patient_id: 'p9',  doctor_id: 'doc2', time: '15:00', duration_minutes: 30, type: 'checkup',      notes: 'Ortho follow-up' },
  { id: 'wapt-sun-6', dayOffset: 1, patient_id: 'p1',  doctor_id: 'doc1', time: '16:30', duration_minutes: 30, type: 'checkup',      notes: 'Cosmetic review' },
  // Mon (offset 2) — 5 apts
  { id: 'wapt-mon-1', dayOffset: 2, patient_id: 'p1',  doctor_id: 'doc1', time: '09:00', duration_minutes: 60, type: 'whitening',    notes: 'Whitening — session 2' },
  { id: 'wapt-mon-2', dayOffset: 2, patient_id: 'p2',  doctor_id: 'doc2', time: '10:00', duration_minutes: 30, type: 'checkup',      notes: 'Brackets check' },
  { id: 'wapt-mon-3', dayOffset: 2, patient_id: 'p10', doctor_id: 'doc1', time: '11:00', duration_minutes: 45, type: 'filling',      notes: 'Anterior composite' },
  { id: 'wapt-mon-4', dayOffset: 2, patient_id: 'p4',  doctor_id: 'doc3', time: '14:30', duration_minutes: 60, type: 'root_canal',   notes: 'Root canal session 2 — sealing' },
  { id: 'wapt-mon-5', dayOffset: 2, patient_id: 'p7',  doctor_id: 'doc2', time: '16:00', duration_minutes: 30, type: 'checkup',      notes: 'Ortho follow-up' },
  // Tue (offset 3) — 6 apts (heavy, Ahmed busy)
  { id: 'wapt-tue-1', dayOffset: 3, patient_id: 'p3',  doctor_id: 'doc1', time: '09:00', duration_minutes: 60, type: 'whitening',    notes: 'Whitening — session 1' },
  { id: 'wapt-tue-2', dayOffset: 3, patient_id: 'p2',  doctor_id: 'doc2', time: '09:30', duration_minutes: 30, type: 'checkup',      notes: 'Brackets adjustment' },
  { id: 'wapt-tue-3', dayOffset: 3, patient_id: 'p8',  doctor_id: 'doc1', time: '10:30', duration_minutes: 30, type: 'consultation', notes: 'Smile design consult' },
  { id: 'wapt-tue-4', dayOffset: 3, patient_id: 'p9',  doctor_id: 'doc1', time: '11:30', duration_minutes: 30, type: 'consultation', notes: 'Cosmetic consult' },
  { id: 'wapt-tue-5', dayOffset: 3, patient_id: 'p10', doctor_id: 'doc1', time: '14:00', duration_minutes: 60, type: 'crown',        notes: 'Crown fitting' },
  { id: 'wapt-tue-6', dayOffset: 3, patient_id: 'p5',  doctor_id: 'doc3', time: '15:30', duration_minutes: 45, type: 'extraction',   notes: 'Wisdom tooth removal' },
  // Wed (offset 4) — 6 apts (heavy)
  { id: 'wapt-wed-1', dayOffset: 4, patient_id: 'p10', doctor_id: 'doc1', time: '09:00', duration_minutes: 30, type: 'cleaning',     notes: 'Pre-veneer cleaning' },
  { id: 'wapt-wed-2', dayOffset: 4, patient_id: 'p7',  doctor_id: 'doc2', time: '10:00', duration_minutes: 30, type: 'checkup',      notes: 'Ortho weekly' },
  { id: 'wapt-wed-3', dayOffset: 4, patient_id: 'p3',  doctor_id: 'doc1', time: '11:00', duration_minutes: 90, type: 'crown',        notes: 'Veneer prep' },
  { id: 'wapt-wed-4', dayOffset: 4, patient_id: 'p8',  doctor_id: 'doc3', time: '14:00', duration_minutes: 60, type: 'crown',        notes: 'Crown cement' },
  { id: 'wapt-wed-5', dayOffset: 4, patient_id: 'p1',  doctor_id: 'doc1', time: '15:30', duration_minutes: 60, type: 'whitening',    notes: 'Whitening — session 3' },
  { id: 'wapt-wed-6', dayOffset: 4, patient_id: 'p9',  doctor_id: 'doc1', time: '16:30', duration_minutes: 30, type: 'consultation', notes: 'Cosmetic consult' },
  // Thu (offset 5) — 4 apts (lighter, pre-weekend)
  { id: 'wapt-thu-1', dayOffset: 5, patient_id: 'p1',  doctor_id: 'doc1', time: '09:00', duration_minutes: 60, type: 'crown',   notes: 'Veneer placement' },
  { id: 'wapt-thu-2', dayOffset: 5, patient_id: 'p2',  doctor_id: 'doc2', time: '11:00', duration_minutes: 30, type: 'checkup', notes: 'Brackets check' },
  { id: 'wapt-thu-3', dayOffset: 5, patient_id: 'p3',  doctor_id: 'doc1', time: '14:30', duration_minutes: 30, type: 'checkup', notes: 'Final cosmetic review' },
  { id: 'wapt-thu-4', dayOffset: 5, patient_id: 'p7',  doctor_id: 'doc2', time: '16:00', duration_minutes: 30, type: 'checkup', notes: 'Ortho weekly' },
  // Fri (offset 6) — empty: Iraqi weekend, clinic closed.
]

// Module-level cache keyed by iraqi week-start ISO. Same week → same array reference,
// helps React reconciliation across day↔week toggles. Recomputes on week boundary.
const _weekCache = new Map()

// Build an ISO timestamp string for the given local date + 'HH:MM' time.
// Stays in local-timezone semantics so demo rows align with Iraqi clinic hours.
function _isoFor(dayDate, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(dayDate)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// Returns ~32 appointments across the current Iraqi week (Sat→Fri), with
// `scheduled_at` ISO timestamps relative to today. Status auto-skewed: past
// days → completed, today → as templated by SAMPLE_DENTAL_APPOINTMENTS_TODAY,
// tomorrow → confirmed, further future → scheduled. Today's slice mirrors
// SAMPLE_DENTAL_APPOINTMENTS_TODAY exactly so DentalDashboard and
// AppointmentsPage agree on today's roster.
export function getSampleDentalAppointmentsWeek() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const ws = _iraqiWeekStart(today)
  const wsKey = ws.toISOString().slice(0, 10)
  if (_weekCache.has(wsKey)) return _weekCache.get(wsKey)

  const todayIdx = _iraqiDayIndex(today)
  const dateFor = (offset) => {
    const d = new Date(ws); d.setDate(d.getDate() + offset); d.setHours(0, 0, 0, 0)
    return d
  }

  // Today's slice — augment SAMPLE_DENTAL_APPOINTMENTS_TODAY with date stamp + joined patient.
  const todayDate = dateFor(todayIdx)
  const todayRows = SAMPLE_DENTAL_APPOINTMENTS_TODAY.map(a => {
    const p = _patientById[a.patient_id]
    return {
      id: a.id,
      org_id: 'demo-org',
      patient_id: a.patient_id,
      doctor_id: a.doctor_id,
      type: a.type,
      status: a.status,
      scheduled_at: _isoFor(todayDate, a.time),
      duration_minutes: a.duration_minutes,
      chair_id: null,
      notes: a.notes || '',
      patients: p ? { id: p.id, full_name: p.full_name, phone: p.phone } : null,
    }
  })

  // Other days — template, skip rows whose offset matches today (today comes from TODAY).
  const otherRows = _DENTAL_WEEK_TEMPLATE
    .filter(tpl => tpl.dayOffset !== todayIdx)
    .map(tpl => {
      let status
      if (tpl.dayOffset < todayIdx) status = 'completed'
      else if (tpl.dayOffset === todayIdx + 1) status = 'confirmed'
      else status = 'scheduled'
      const p = _patientById[tpl.patient_id]
      const dayDate = dateFor(tpl.dayOffset)
      return {
        id: tpl.id,
        org_id: 'demo-org',
        patient_id: tpl.patient_id,
        doctor_id: tpl.doctor_id,
        type: tpl.type,
        status,
        scheduled_at: _isoFor(dayDate, tpl.time),
        duration_minutes: tpl.duration_minutes,
        chair_id: null,
        notes: tpl.notes || '',
        patients: p ? { id: p.id, full_name: p.full_name, phone: p.phone } : null,
      }
    })

  const result = [...todayRows, ...otherRows]
  _weekCache.set(wsKey, result)
  return result
}

export const SAMPLE_ACTIVITIES = [
  {
    id: 'act1',
    icon: 'deal',
    color: '#1A7F37',
    text: 'Deal won: Cloud Strategies Analytics Module ($9,600)',
    time: '2 hours ago',
  },
  {
    id: 'act2',
    icon: 'contact',
    color: '#0969DA',
    text: 'New contact added: David Park from Kore Innovate',
    time: '5 hours ago',
  },
  {
    id: 'act3',
    icon: 'message',
    color: '#8250DF',
    text: 'New message from Sarah Mitchell re: Contract Renewal',
    time: '6 hours ago',
  },
  {
    id: 'act4',
    icon: 'task',
    color: '#D29922',
    text: 'Task completed: Send onboarding docs to Cloud Strategies',
    time: 'Yesterday',
  },
  {
    id: 'act5',
    icon: 'deal',
    color: '#CF222E',
    text: 'Deal lost: Apex Supply SaaS Tools ($6,000)',
    time: 'Yesterday',
  },
  {
    id: 'act6',
    icon: 'automation',
    color: '#0969DA',
    text: 'Automation triggered: Welcome email sent to Elena Vasquez',
    time: '2 days ago',
  },
]
