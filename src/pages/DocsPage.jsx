import { useState, useRef, useCallback } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'

// ─── Persistence ────────────────────────────────────────────────────────────
const DEFAULT_FOLDERS = [
  { id: 'general', name: 'General', nameAr: '\u0639\u0627\u0645' },
  { id: 'templates', name: 'Templates', nameAr: '\u0642\u0648\u0627\u0644\u0628' },
  { id: 'meetings', name: 'Meeting Notes', nameAr: '\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u0627\u062A' },
]

function loadDocs() { try { return JSON.parse(localStorage.getItem('velo_docs') || '[]') } catch { return [] } }
function saveDocs(d) { localStorage.setItem('velo_docs', JSON.stringify(d)) }
function loadFolders() { try { return JSON.parse(localStorage.getItem('velo_doc_folders') || 'null') || DEFAULT_FOLDERS } catch { return DEFAULT_FOLDERS } }
function saveFolders(f) { localStorage.setItem('velo_doc_folders', JSON.stringify(f)) }

// ─── Inline Icons (not in shared.jsx) ───────────────────────────────────────
const FolderIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
)

const FileIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
)

// ─── Rich Text Toolbar ──────────────────────────────────────────────────────
const TOOLBAR_GROUPS = [
  [
    { cmd: 'bold', label: 'B', style: { fontWeight: 700 } },
    { cmd: 'italic', label: 'I', style: { fontStyle: 'italic' } },
    { cmd: 'underline', label: 'U', style: { textDecoration: 'underline' } },
    { cmd: 'strikeThrough', label: 'S', style: { textDecoration: 'line-through' } },
  ],
  [
    { cmd: 'formatBlock', arg: 'h1', label: 'H1', style: { fontWeight: 700, fontSize: 13 } },
    { cmd: 'formatBlock', arg: 'h2', label: 'H2', style: { fontWeight: 700, fontSize: 12 } },
    { cmd: 'formatBlock', arg: 'h3', label: 'H3', style: { fontWeight: 600, fontSize: 11 } },
  ],
  [
    { cmd: 'insertUnorderedList', label: '\u2022 List', style: {} },
    { cmd: 'insertOrderedList', label: '1. List', style: {} },
  ],
  [
    { cmd: 'createLink', label: 'Link', style: {}, promptLabel: true },
  ],
]

const COLORS = ['#101422', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#EC4899']

function Toolbar({ editorRef, isRTL }) {
  const exec = (cmd, arg) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, arg || null)
  }

  const handleLink = () => {
    const url = prompt(isRTL ? '\u0623\u062F\u062E\u0644 \u0627\u0644\u0631\u0627\u0628\u0637:' : 'Enter URL:')
    if (url) exec('createLink', url)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, padding: '8px 12px',
      borderBottom: `1px solid ${C.border}`, background: C.bg, flexWrap: 'wrap',
    }}>
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {gi > 0 && <div style={{ width: 1, height: 20, background: C.border, margin: '0 6px' }} />}
          {group.map((btn) => (
            <button
              key={btn.cmd + (btn.arg || '')}
              type="button"
              title={btn.label}
              onClick={() => btn.promptLabel ? handleLink() : exec(btn.cmd, btn.arg ? `<${btn.arg}>` : undefined)}
              style={{
                ...btn.style,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 4, color: C.textSec, fontSize: 13,
                lineHeight: 1, minWidth: 28, textAlign: 'center',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.borderLight}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {btn.label}
            </button>
          ))}
        </div>
      ))}

      {/* Color picker */}
      <div style={{ width: 1, height: 20, background: C.border, margin: '0 6px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => exec('foreColor', c)}
            style={{
              width: 18, height: 18, borderRadius: '50%', background: c,
              border: c === '#101422' ? `2px solid ${C.border}` : `2px solid ${c}`,
              cursor: 'pointer', padding: 0,
              transition: 'transform 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Helper: strip HTML to plain text snippet ──────────────────────────────
function snippetFromHtml(html, max = 80) {
  if (!html) return ''
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '...' : text
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DocsPage({ t, lang, dir, isRTL, contacts, deals, toast }) {
  const [docs, setDocs] = useState(loadDocs)
  const [folders, setFolders] = useState(loadFolders)
  const [selectedFolder, setSelectedFolder] = useState('general')
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [search, setSearch] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderNameAr, setNewFolderNameAr] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const editorRef = useRef(null)

  const persist = (next) => { setDocs(next); saveDocs(next) }
  const persistFolders = (next) => { setFolders(next); saveFolders(next) }

  const selectedDoc = docs.find(d => d.id === selectedDocId) || null

  // Filtered docs
  const filteredDocs = docs
    .filter(d => d.folderId === selectedFolder)
    .filter(d => !search || d.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))

  // ─── Actions ────────────────────────────────────────────────
  const createDoc = () => {
    const now = new Date().toISOString()
    const doc = {
      id: 'doc_' + Date.now(),
      title: isRTL ? '\u0645\u0633\u062A\u0646\u062F \u062C\u062F\u064A\u062F' : 'New Document',
      content: '',
      folderId: selectedFolder,
      linkedContacts: [],
      linkedDeals: [],
      createdAt: now,
      updatedAt: now,
    }
    const next = [doc, ...docs]
    persist(next)
    setSelectedDocId(doc.id)
    if (toast) toast(isRTL ? '\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0633\u062A\u0646\u062F' : 'Document created')
  }

  const deleteDoc = (id) => {
    persist(docs.filter(d => d.id !== id))
    if (selectedDocId === id) setSelectedDocId(null)
    setConfirmDeleteId(null)
    if (toast) toast(isRTL ? '\u062A\u0645 \u0627\u0644\u062D\u0630\u0641' : 'Document deleted')
  }

  const updateDoc = useCallback((field, value) => {
    setDocs(prev => {
      const next = prev.map(d => d.id === selectedDocId ? { ...d, [field]: value, updatedAt: new Date().toISOString() } : d)
      saveDocs(next)
      return next
    })
  }, [selectedDocId])

  const handleEditorBlur = useCallback(() => {
    if (editorRef.current && selectedDocId) {
      updateDoc('content', editorRef.current.innerHTML)
    }
  }, [selectedDocId, updateDoc])

  const addFolder = () => {
    if (!newFolderName.trim()) return
    const id = 'folder_' + Date.now()
    persistFolders([...folders, { id, name: newFolderName.trim(), nameAr: newFolderNameAr.trim() || newFolderName.trim() }])
    setAddingFolder(false)
    setNewFolderName('')
    setNewFolderNameAr('')
    setSelectedFolder(id)
  }

  const toggleLinkedContact = (cid) => {
    if (!selectedDoc) return
    const linked = selectedDoc.linkedContacts || []
    const next = linked.includes(cid) ? linked.filter(x => x !== cid) : [...linked, cid]
    updateDoc('linkedContacts', next)
  }

  const toggleLinkedDeal = (did) => {
    if (!selectedDoc) return
    const linked = selectedDoc.linkedDeals || []
    const next = linked.includes(did) ? linked.filter(x => x !== did) : [...linked, did]
    updateDoc('linkedDeals', next)
  }

  const folderName = (f) => isRTL ? (f.nameAr || f.name) : f.name
  const folderDocCount = (fid) => docs.filter(d => d.folderId === fid).length

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div style={{ direction: dir }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>
            {isRTL ? '\u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A' : 'Documents'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
            {docs.length} {isRTL ? '\u0645\u0633\u062A\u0646\u062F' : 'documents'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', [isRTL ? 'right' : 'left']: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted, pointerEvents: 'none' }}>
              {Icons.search(14)}
            </span>
            <input
              type="text"
              placeholder={isRTL ? '\u0628\u062D\u062B...' : 'Search docs...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle(dir), width: 200, [isRTL ? 'paddingRight' : 'paddingLeft']: 32 }}
            />
          </div>
          <button type="button" onClick={createDoc} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
            {Icons.plus(14)} {isRTL ? '\u0645\u0633\u062A\u0646\u062F \u062C\u062F\u064A\u062F' : 'New Document'}
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left Panel: Folders + Doc List */}
        <div style={{ width: 240, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Folders */}
          <div style={{ ...card, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {isRTL ? '\u0627\u0644\u0645\u062C\u0644\u062F\u0627\u062A' : 'Folders'}
              </span>
              <button
                type="button"
                onClick={() => setAddingFolder(true)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.primary, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                title={isRTL ? '\u0645\u062C\u0644\u062F \u062C\u062F\u064A\u062F' : 'New Folder'}
              >
                {Icons.plus(14)}
              </button>
            </div>

            {folders.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setSelectedFolder(f.id); setSelectedDocId(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                  borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                  background: selectedFolder === f.id ? C.primaryBg : 'transparent',
                  color: selectedFolder === f.id ? C.primary : C.textSec,
                  fontWeight: selectedFolder === f.id ? 600 : 400,
                  transition: 'all 150ms',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                <FolderIcon size={15} color={selectedFolder === f.id ? C.primary : C.textMuted} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folderName(f)}
                </span>
                <span style={{ fontSize: 11, color: C.textMuted, minWidth: 16, textAlign: 'center' }}>
                  {folderDocCount(f.id)}
                </span>
              </button>
            ))}

            {/* Inline add folder */}
            {addingFolder && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder={isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0645\u062C\u0644\u062F (EN)' : 'Folder name'}
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFolder()}
                  autoFocus
                  style={{ ...inputStyle(dir), height: 30, fontSize: 12 }}
                />
                <input
                  type="text"
                  placeholder={isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0645\u062C\u0644\u062F (\u0639\u0631\u0628\u064A)' : 'Arabic name (optional)'}
                  value={newFolderNameAr}
                  onChange={e => setNewFolderNameAr(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFolder()}
                  style={{ ...inputStyle(dir), height: 30, fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={addFolder} className="velo-btn-primary" style={makeBtn('primary', { height: 28, fontSize: 12, padding: '0 10px', flex: 1 })}>
                    {isRTL ? '\u0625\u0636\u0627\u0641\u0629' : 'Add'}
                  </button>
                  <button type="button" onClick={() => { setAddingFolder(false); setNewFolderName(''); setNewFolderNameAr('') }} style={makeBtn('ghost', { height: 28, fontSize: 12, padding: '0 10px' })}>
                    {Icons.x(12)}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Document List */}
          <div style={{ ...card, padding: 8, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
            {filteredDocs.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                {search
                  ? (isRTL ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C' : 'No results')
                  : (isRTL ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0633\u062A\u0646\u062F\u0627\u062A' : 'No documents')}
              </div>
            ) : (
              filteredDocs.map(d => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDocId(d.id)}
                  style={{
                    padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                    background: selectedDocId === d.id ? C.primaryBg : 'transparent',
                    borderBottom: `1px solid ${C.borderLight}`,
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={e => { if (selectedDocId !== d.id) e.currentTarget.style.background = C.bg }}
                  onMouseLeave={e => { if (selectedDocId !== d.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <FileIcon size={14} color={selectedDocId === d.id ? C.primary : C.textMuted} />
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: selectedDocId === d.id ? C.primary : C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {d.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(d.id) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      {Icons.trash(13)}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>
                    {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                  <div style={{ fontSize: 12, color: C.textLabel, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {snippetFromHtml(d.content, 60) || (isRTL ? '\u0641\u0627\u0631\u063A' : 'Empty')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedDoc ? (
            <div style={{ ...card, overflow: 'hidden' }}>
              {/* Title */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="text"
                  value={selectedDoc.title}
                  onChange={e => updateDoc('title', e.target.value)}
                  style={{
                    flex: 1, border: 'none', outline: 'none', fontSize: 18, fontWeight: 700,
                    color: C.text, fontFamily: 'DM Sans,Inter,sans-serif', background: 'transparent',
                    direction: dir, textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholder={isRTL ? '\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0633\u062A\u0646\u062F' : 'Document title'}
                />
                <button
                  type="button"
                  onClick={() => setShowLinkModal(true)}
                  style={makeBtn('secondary', { height: 30, fontSize: 12, gap: 4, padding: '0 10px' })}
                >
                  {Icons.link(13)} {isRTL ? '\u0631\u0628\u0637' : 'Link'}
                </button>
              </div>

              {/* Linked items pills */}
              {((selectedDoc.linkedContacts?.length > 0) || (selectedDoc.linkedDeals?.length > 0)) && (
                <div style={{ padding: '8px 20px', borderBottom: `1px solid ${C.borderLight}`, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {(selectedDoc.linkedContacts || []).map(cid => {
                    const c = (contacts || []).find(x => x.id === cid)
                    if (!c) return null
                    return (
                      <span key={cid} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                        borderRadius: 12, background: C.primaryBg, color: C.primary, fontSize: 12, fontWeight: 500,
                      }}>
                        {Icons.user(11)} {c.name}
                        <button type="button" onClick={() => toggleLinkedContact(cid)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.primary, padding: 0, display: 'flex', alignItems: 'center' }}>
                          {Icons.x(11)}
                        </button>
                      </span>
                    )
                  })}
                  {(selectedDoc.linkedDeals || []).map(did => {
                    const d = (deals || []).find(x => x.id === did)
                    if (!d) return null
                    return (
                      <span key={did} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                        borderRadius: 12, background: C.successBg, color: C.success, fontSize: 12, fontWeight: 500,
                      }}>
                        {Icons.dollar(11)} {d.name || d.title}
                        <button type="button" onClick={() => toggleLinkedDeal(did)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.success, padding: 0, display: 'flex', alignItems: 'center' }}>
                          {Icons.x(11)}
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Toolbar */}
              <Toolbar editorRef={editorRef} isRTL={isRTL} />

              {/* Editor Area */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                dir={dir}
                onBlur={handleEditorBlur}
                dangerouslySetInnerHTML={{ __html: selectedDoc.content || '' }}
                style={{
                  minHeight: 400, padding: 20, fontSize: 15, lineHeight: 1.7,
                  color: C.text, background: C.white, outline: 'none',
                  fontFamily: 'inherit', direction: dir,
                  overflowY: 'auto', maxHeight: 'calc(100vh - 340px)',
                }}
              />

              {/* Footer */}
              <div style={{
                padding: '10px 20px', borderTop: `1px solid ${C.borderLight}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 11, color: C.textMuted,
              }}>
                <span>
                  {isRTL ? '\u0622\u062E\u0631 \u062A\u0639\u062F\u064A\u0644: ' : 'Last modified: '}
                  {selectedDoc.updatedAt ? new Date(selectedDoc.updatedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US') : '-'}
                </span>
                <span>
                  {isRTL ? '\u062A\u0645 \u0627\u0644\u0625\u0646\u0634\u0627\u0621: ' : 'Created: '}
                  {selectedDoc.createdAt ? new Date(selectedDoc.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US') : '-'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: 60, textAlign: 'center' }}>
              <div style={{ marginBottom: 16, color: C.textMuted }}>
                <FileIcon size={48} color={C.border} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px', fontFamily: 'DM Sans,Inter,sans-serif' }}>
                {isRTL ? '\u0627\u062E\u062A\u0631 \u0645\u0633\u062A\u0646\u062F\u0627\u064B \u0623\u0648 \u0623\u0646\u0634\u0626 \u0648\u0627\u062D\u062F\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B' : 'Select a document or create a new one'}
              </h3>
              <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 20px' }}>
                {isRTL ? '\u0627\u062E\u062A\u0631 \u0645\u0633\u062A\u0646\u062F\u0627\u064B \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0648 \u0623\u0646\u0634\u0626 \u0645\u0633\u062A\u0646\u062F\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B \u0644\u0644\u0628\u062F\u0621' : 'Pick a document from the list or create a new one to get started'}
              </p>
              <button type="button" onClick={createDoc} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
                {Icons.plus(14)} {isRTL ? '\u0645\u0633\u062A\u0646\u062F \u062C\u062F\u064A\u062F' : 'New Document'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir}>
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 12px', fontFamily: 'DM Sans,Inter,sans-serif' }}>
              {isRTL ? '\u062D\u0630\u0641 \u0627\u0644\u0645\u0633\u062A\u0646\u062F' : 'Delete Document'}
            </h3>
            <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 20px' }}>
              {isRTL ? '\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u061F \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.' : 'Are you sure you want to delete this document? This action cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmDeleteId(null)} style={makeBtn('secondary')}>
                {isRTL ? '\u0625\u0644\u063A\u0627\u0621' : 'Cancel'}
              </button>
              <button type="button" onClick={() => deleteDoc(confirmDeleteId)} style={makeBtn('danger', { gap: 4 })}>
                {Icons.trash(13)} {isRTL ? '\u062D\u0630\u0641' : 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Link Contacts/Deals modal */}
      {showLinkModal && selectedDoc && (
        <Modal onClose={() => setShowLinkModal(false)} dir={dir} width={480}>
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>
              {Icons.link(16)} {isRTL ? '\u0631\u0628\u0637 \u062C\u0647\u0627\u062A \u0627\u062A\u0635\u0627\u0644 \u0648\u0635\u0641\u0642\u0627\u062A' : 'Link Contacts & Deals'}
            </h3>

            {/* Contacts */}
            <FormField label={isRTL ? '\u062C\u0647\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644' : 'Contacts'} dir={dir}>
              <select
                style={selectStyle(dir)}
                value=""
                onChange={e => { if (e.target.value) toggleLinkedContact(e.target.value) }}
              >
                <option value="">{isRTL ? '\u0627\u062E\u062A\u0631 \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644...' : 'Select contact...'}</option>
                {(contacts || []).filter(c => !(selectedDoc.linkedContacts || []).includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {(selectedDoc.linkedContacts || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {(selectedDoc.linkedContacts || []).map(cid => {
                    const c = (contacts || []).find(x => x.id === cid)
                    if (!c) return null
                    return (
                      <span key={cid} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                        borderRadius: 12, background: C.primaryBg, color: C.primary, fontSize: 12, fontWeight: 500,
                      }}>
                        {Icons.user(11)} {c.name}
                        <button type="button" onClick={() => toggleLinkedContact(cid)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.primary, padding: 0, display: 'flex', alignItems: 'center' }}>
                          {Icons.x(11)}
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </FormField>

            {/* Deals */}
            <FormField label={isRTL ? '\u0627\u0644\u0635\u0641\u0642\u0627\u062A' : 'Deals'} dir={dir}>
              <select
                style={selectStyle(dir)}
                value=""
                onChange={e => { if (e.target.value) toggleLinkedDeal(e.target.value) }}
              >
                <option value="">{isRTL ? '\u0627\u062E\u062A\u0631 \u0635\u0641\u0642\u0629...' : 'Select deal...'}</option>
                {(deals || []).filter(d => !(selectedDoc.linkedDeals || []).includes(d.id)).map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.title}</option>
                ))}
              </select>
              {(selectedDoc.linkedDeals || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {(selectedDoc.linkedDeals || []).map(did => {
                    const d = (deals || []).find(x => x.id === did)
                    if (!d) return null
                    return (
                      <span key={did} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                        borderRadius: 12, background: C.successBg, color: C.success, fontSize: 12, fontWeight: 500,
                      }}>
                        {Icons.dollar(11)} {d.name || d.title}
                        <button type="button" onClick={() => toggleLinkedDeal(did)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.success, padding: 0, display: 'flex', alignItems: 'center' }}>
                          {Icons.x(11)}
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setShowLinkModal(false)} className="velo-btn-primary" style={makeBtn('primary')}>
                {isRTL ? '\u062A\u0645' : 'Done'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
