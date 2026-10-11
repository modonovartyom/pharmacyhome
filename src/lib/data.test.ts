import { describe, expect, it } from 'vitest';
import inventory from '../data/inventory.json';
import { expiryStatus } from './expiry';
import { mapLegacyInventory } from './legacy';

describe('Excel import',()=>{
 it('keeps every source row and review flag',()=>{
  expect(inventory).toHaveLength(95);
  expect(inventory.filter(r=>r.needs_review)).toHaveLength(43);
  expect(new Set(inventory.map(r=>r.source_id)).size).toBe(95);
  expect(new Set(inventory.map(r=>r.storage_location))).toEqual(new Set(['Зелёный ящик','Нижний ящик']));
  expect(inventory.filter(r=>r.quantity===null)).toHaveLength(4);
 });
 it('does not fill an expiry when the workbook has none',()=>{
  expect(inventory.filter(r=>r.expiry_precision==='не указан'||r.expiry_precision==='дата изготовления').every(r=>r.expires_on===null)).toBe(true);
 });
});
describe('legacy import',()=>{
 it('validates and marks untrusted rows without adding missing medical data',()=>{
  const rows=mapLegacyInventory(JSON.stringify([{name:'Тест',quantity:2},{name:' '},{name:'Другой',expires_on:'not a date'}]));
  expect(rows).toHaveLength(2);
  expect(rows?.[0]).toMatchObject({quantity:2,dosage:null,expires_on:null,needs_review:true});
  expect(rows?.[1]?.expires_on).toBeNull();
  expect(mapLegacyInventory('{bad')).toBeNull();
 });
});
describe('expiry status',()=>{
 it('separates unknown, expired and upcoming batches',()=>{
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  expect(expiryStatus(null)).toBe('unknown');
  expect(expiryStatus(yesterday)).toBe('expired');
  expect(expiryStatus(tomorrow,7)).toBe('soon');
 });
});
