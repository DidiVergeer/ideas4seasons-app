// components/pricing/itemcodeKey.ts
export function itemcodeKey(p: any): string {
  return String(
    p?.itemcode ??
    p?.itemCode ??
    p?.ItemCode ??
    p?.item_code ??
    p?.ARTICLECODE ??
    p?.articleNumber ??
    p?.article_number ??
    ""
  ).trim();
}
