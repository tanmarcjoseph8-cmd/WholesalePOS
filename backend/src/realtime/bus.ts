import { EventEmitter } from "node:events";
import type { RealtimeEventName } from "./events.js";

type RealtimePayload = {
  entityId: string;
  actorId?: string;
  storeId?: string | null;
  occurredAt: string;
};

const realtimeBus = new EventEmitter();

export function publishRealtimeEvent(eventName: RealtimeEventName, payload: RealtimePayload) {
  realtimeBus.emit(eventName, payload);
}

export function subscribeRealtimeEvent(eventName: RealtimeEventName, listener: (payload: RealtimePayload) => void) {
  realtimeBus.on(eventName, listener);
  return () => realtimeBus.off(eventName, listener);
}
