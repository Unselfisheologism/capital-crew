/**
 * Capital Crew — PROPERTY TRADE NEGOTIATIONS
 *
 * Players (and AI) can propose trades between themselves: my property + cash
 * for their property + cash. Each AI asks for at least a 10% markup vs. raw
 * value, but will accept counter-offers closer to fair (within 5%).
 *
 * UI flow (Human → AI):
 *   1. Player presses G while standing on a property they're in the zone of
 *   2. Modal opens with: pick one of THEIR properties, see list of AI offers
 *   3. For each AI: shows their visible offer (one of their unowned properties
 *      + cash ask diff), and a Buy Now / Send Counter button
 *   4. Counter modal: choose properties from YOUR side, tweak cash, send
 *   5. AI evaluates over 5 simulated seconds, accepts/denies with a reason
 *
 * The essence is offline Monopoly's "trade with the player next to you,
 * give two railroads for Boardwalk + $200" — speed and clarity win deals.
 */
import Phaser from 'phaser';
import { PlayerState } from '../state/PlayerState';
import { getProperty } from '../data/Properties';

export interface TradeOffer {
  /** Who sent the offer. */
  fromId: string;
  fromName: string;
  /** Who the offer is for. */
  toId: string;
  toName: string;
  /** Properties + cash the OFFEROR sends away. */
  offeredProperties: string[];
  offeredCash: number;
  /** Properties + cash the OFFEROR demands. */
  requestedProperties: string[];
  requestedCash: number;
  /** Status. */
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
  /** Reject reason if rejected. */
  reason?: string;
  /** Created at timestamp. */
  createdMs: number;
}

export const TRADE_MIN_MARKUP = 0.10;  // AI asks 10% above raw value
export const TRADE_FAIR_BAND = 0.05;   // within 5% of fair = auto-accept
export const TRADE_DECISION_DELAY_MS = 4500;
export const TRADE_RANGE_PX = 90;      // proximity required to open trade modal

/** Compute raw asset value of a player's side of a trade. */
export function tradeSideValue(
  properties: string[],
  cash: number,
  forPlayer: PlayerState,
  otherPlayer: PlayerState,
): number {
  let propVal = 0;
  for (const pid of properties) {
    const prop = getProperty(pid);
    if (!prop) continue;
    // Level-adjusted: assume level 1 (most common)
    propVal += prop.cost;
  }
  // Cash value is 1:1 only if receiver has the room. Penalise if sender
  // is over-leveraged: shrink the cash they promise by 5% if debt > $5000.
  const cashValue = forPlayer.debt > 5000 ? cash * 0.95 : cash;
  return propVal + cashValue;
}

/**
 * AI evaluates a human's offer aimed at them.
 * Returns { accept, reason }.
 */
export function evaluateOffer(offer: TradeOffer, ai: PlayerState): {
  accept: boolean;
  reason: string;
} {
  // Compute offered-by-human value: property cost + cash (with leverage penalty).
  let offeredPropVal = 0;
  for (const pid of offer.offeredProperties) {
    const prop = getProperty(pid);
    if (prop) offeredPropVal += prop.cost;
  }
  const senderLeveraged = ai.debt > 5000; // approximation for the human sender
  const offeredCashVal =
    senderLeveraged ? offer.offeredCash * 0.95 : offer.offeredCash;
  const offeredVal = offeredPropVal + offeredCashVal;

  // AI looks at the requested side (what human wants from AI)
  let requestedPropVal = 0;
  for (const pid of offer.requestedProperties) {
    const prop = getProperty(pid);
    if (prop) requestedPropVal += prop.cost;
  }
  const requestedCashVal = offer.requestedCash; // AI's outgoing cash
  const requestedVal = requestedPropVal + requestedCashVal;

  if (requestedVal === 0) {
    return { accept: false, reason: 'AI wants nothing → no deal' };
  }
  const ratio = offeredVal / requestedVal;
  if (ratio >= 1 + TRADE_MIN_MARKUP) {
    return { accept: false, reason: 'AI: not enough value offered' };
  }
  if (ratio <= 1 - TRADE_FAIR_BAND) {
    return { accept: false, reason: 'AI: I want more for my side' };
  }
  return { accept: true, reason: 'Deal!' };
}

/**
 * For an AI to compose an opening offer to the human: pick an unowned
 * property they don't want (or any), and ask for one of human's, plus cash.
 */
export function composeAiOpeningOffer(
  ai: PlayerState,
  human: PlayerState,
  reason: 'bankrupt' | 'leader' | 'casual' = 'casual',
): TradeOffer | null {
  if (human.ownedPropertyIds.size === 0 || ai.ownedPropertyIds.size === 0) {
    return null;
  }
  const aiProps = Array.from(ai.ownedPropertyIds);
  const aiPick = aiProps[Math.floor(Math.random() * aiProps.length)];
  const humanProps = Array.from(human.ownedPropertyIds);
  const humanPick = humanProps[Math.floor(Math.random() * humanProps.length)];

  // Cash ask: AI wants the human to pay the difference if their pick is worth less
  const aiPropVal = getProperty(aiPick)?.cost ?? 0;
  const humPropVal = getProperty(humanPick)?.cost ?? 0;
  let cashAsk = 0;
  if (aiPropVal > humPropVal) {
    const diff = aiPropVal - humPropVal;
    cashAsk = Math.floor(diff * (1 + TRADE_MIN_MARKUP));
  }
  // If AI is bankrupt-mode, demand more
  if (reason === 'bankrupt' && ai.cash < 1000) {
    cashAsk = Math.max(cashAsk, Math.floor(aiPropVal * 0.4));
  }

  return {
    fromId: ai.id,
    fromName: ai.name,
    toId: human.id,
    toName: human.name,
    offeredProperties: [humanPick],
    offeredCash: -cashAsk, // human must pay AI cashAsk
    requestedProperties: [aiPick],
    requestedCash: cashAsk,
    status: 'pending',
    createdMs: Date.now(),
  };
}
