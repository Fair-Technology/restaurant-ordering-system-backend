import type { Category } from '../../../domain/category/Category';
import type { Product } from '../../../domain/product/Product';
import { lineIsTimed, lineServedAt, type BasketItemInput, type PricedLine } from '../_shared/priceBasket';

export interface TimeLimitedLineDto {
  index: number;
  servedNow: boolean; // served right now
  servedLater: boolean; // served at one or more bookable slots
}

export interface BasketTimes {
  servedNow: boolean;
  slots: string[];
  chosenServed: boolean | null;
  timeLimited: TimeLimitedLineDto[];
}

/**
 * Which times the whole basket can be served at. Only timed lines that priced fine are judged: a line refused for
 * another reason is left to the "basket changed" notice, and an untimed line never limits the time.
 */
export function judgeBasketTimes(input: {
  items: BasketItemInput[];
  lines: PricedLine[];
  products: Map<string, Product>;
  categories: Category[];
  timezone: string;
  now: Date;
  openNow: boolean;
  bookable: string[];
  chosen: Date | null;
}): BasketTimes {
  const { items, products, categories, timezone, now } = input;
  const timed = input.lines
    .filter((l) => (l.status === 'ok' || l.status === 'price_changed') && lineIsTimed(items[l.index], products, categories))
    .map((l) => l.index);
  const served = (i: number, at: Date) => lineServedAt(items[i], products, categories, timezone, at);
  const slotDates = input.bookable.map((s) => new Date(s));
  const bySlot = timed.map((i) => slotDates.map((d) => served(i, d))); // [timed line][slot]
  const byNow = timed.map((i) => served(i, now));
  return {
    servedNow: byNow.every(Boolean),
    slots: input.bookable.filter((_, k) => bySlot.every((row) => row[k])),
    chosenServed: input.chosen ? timed.every((i) => served(i, input.chosen!)) : null,
    timeLimited: timed.flatMap((index, n) => {
      const always = (!input.openNow || byNow[n]) && bySlot[n].every(Boolean);
      return always ? [] : [{ index, servedNow: byNow[n], servedLater: bySlot[n].some(Boolean) }];
    }),
  };
}
