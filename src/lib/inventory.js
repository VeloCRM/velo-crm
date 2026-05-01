/**
 * Velo CRM — inventory helpers.
 *
 * Targets the legacy `items` table for compatibility with the current
 * InventoryPage. The new-schema equivalent is `inventory_items` and will
 * be retargeted at cutover.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS, toSafeNumber } from './sanitize'

function sanitizeItem(item) {
  return {
    ...item,
    name: sanitizeText(item.name || '', LIMITS.name),
    category: sanitizeText(item.category || '', 32),
    unit: sanitizeText(item.unit || '', 16),
    supplier: sanitizeText(item.supplier || '', 100),
    notes: sanitizeText(item.notes || '', LIMITS.notes),
    quantity: Math.max(0, toSafeNumber(item.quantity, 0)),
    min_quantity: Math.max(0, toSafeNumber(item.min_quantity, 0)),
    cost_price: Math.max(0, toSafeNumber(item.cost_price, 0)),
  }
}

export async function fetchInventoryItems() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('items')
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
    .from('items')
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
    .from('items')
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
    .from('items')
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
