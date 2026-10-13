import type { Shop } from '../src/domain/shop/Shop';
import { DE_REFERENCE_LISTS, DELIVERY_TAX_CLASS_ID, type ReferenceListsDoc } from '../src/domain/reference/ReferenceLists';

/** The script refuses unless --target names the database host it is really configured for. Returns that host. */
export function assertScriptTarget(endpoint: string | undefined, target: string | undefined): string {
  const host = new URL(endpoint ?? 'https://localhost:8081').hostname;
  if (!target) throw new Error('Refusing to run: pass --target=<database host>');
  if (target !== host) throw new Error(`Refusing to run: the database is ${host} but --target says ${target}`);
  return host;
}

/** The stored lists plus the Delivery class and its three 19 % rows; null when the class is already there. */
export function withDeliveryTaxClass(doc: ReferenceListsDoc): ReferenceListsDoc | null {
  if (doc.taxClasses.some((c) => c.id === DELIVERY_TAX_CLASS_ID)) return null;
  const cls = DE_REFERENCE_LISTS.taxClasses.filter((c) => c.id === DELIVERY_TAX_CLASS_ID);
  const rows = DE_REFERENCE_LISTS.taxRates.filter((r) => r.taxClassId === DELIVERY_TAX_CLASS_ID);
  return { ...doc, taxClasses: [...doc.taxClasses, ...cls], taxRates: [...doc.taxRates, ...rows] };
}

/** Tidies a stored fee class (no longer read) back to null; null when there is nothing to change. */
export function withDeliveryFeeClassReset(shop: Shop): Shop | null {
  const v = shop.orderSettings?.deliveryFeeTaxClassId;
  if (v == null || v === DELIVERY_TAX_CLASS_ID) return null;
  return { ...shop, orderSettings: { ...shop.orderSettings, deliveryFeeTaxClassId: null } };
}
