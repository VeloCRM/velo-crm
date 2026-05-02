/**
 * Velo CRM — inventory helpers (new schema).
 *
 * Targets the `inventory_items` table (was `items`). Schema columns:
 *   id, org_id, name, category, quantity, unit, low_stock_threshold,
 *   last_restocked_at, created_at, updated_at.
 *
 * Category enum: consumables | equipment | medications | lab_materials |
 *                sterilization | other
 *
 * Legacy columns (supplier, notes, cost_price, min_quantity) are gone.
 * `min_quantity` is now `low_stock_threshold`.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS, toSafeNumber } from './sanitize'

const CATEGORIES = new Set([
  'consumables', 'equipment', 'medications', 'lab_materials',
  'sterilization', 'other',
])

function sanitizeCategory(c) {
  const safe = sanitizeText(c || 'other', 32).toLowerCase().replace(/\s+/g, '_')
  return CATEGORIES.has(safe) ? safe : 'other'
}

function sanitizeItem(item) {
  return {
    name: sanitizeText(item.name || '', LIMITS.name),
    category: sanitizeCategory(item.category),
    unit: sanitizeText(item.unit || 'unit', 16),
    quantity: Math.max(0, toSafeNumber(item.quantity, 0)),
    low_stock_threshold: Math.max(0, toSafeNumber(
      item.low_stock_threshold ?? item.lowStockThreshold ?? item.min_quantity, 0
    )),
    last_restocked_at: item.last_restocked_at || item.lastRestockedAt || null,
  }
}

export async function fetchInventoryItems() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .order('name')
  if (error) throw error
  return data || []
}

export async function insertInventoryItem(item) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const payload = { ...sanitizeItem(item), org_id: orgId }

  const { data, error } = await supabase
    .from('inventory_items')
    .insert([payload])
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'inventory_item.create',
    entityType: 'inventory_item',
    entityId: data?.id || null,
  })
  return data
}

export async function updateInventoryItem(id, item) {
  if (!id) throw new Error('updateInventoryItem: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const payload = sanitizeItem(item)

  const { error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'inventory_item.update',
    entityType: 'inventory_item',
    entityId: id,
  })
}

export async function deleteInventoryItem(id) {
  if (!id) throw new Error('deleteInventoryItem: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'inventory_item.delete',
    entityType: 'inventory_item',
    entityId: id,
  })
}
