import type { Ctx } from "./bot.js";

export type StudentStatus = "Active" | "Exit Exam" | "Graduating";

export interface StudentRecord {
  student_id: string;
  name: string;
  status: StudentStatus;
  contact_info: string;
  preferred_contact: string;
  program: string;
  enrollment_dates: string;
  exam_results: string;
  graduation_clearance: string;
  notes: string;
  verification_code?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ChangeLog {
  record_id: string;
  changed_by: string;
  change_type: string;
  old_values: Record<string, string>;
  new_values: Record<string, string>;
  timestamp: string;
}

export interface TelegramUserMapping {
  telegram_id: string;
  student_id: string;
  verified: boolean;
  linked_at: string;
}

interface DataState {
  studentIds: string[];
  students: Record<string, StudentRecord>;
  mappings: Record<string, TelegramUserMapping>;
  auditByStudent: Record<string, ChangeLog[]>;
  adminIds: string[];
}

interface DomainSession {
  __studentRecordsState?: DataState;
}

const STATE_KEY = "student-records:v1";
const emptyState = (): DataState => ({ studentIds: [], students: {}, mappings: {}, auditByStudent: {}, adminIds: [] });

let clock: () => Date = () => new Date();
export const now = (): Date => clock();
/** Test seam for time-sensitive audit assertions. */
export const setNowForTest = (next?: () => Date): void => { clock = next ?? (() => new Date()); };

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function keyId(value: string): string { return value.trim().toUpperCase(); }

async function workerState(ctx: Ctx): Promise<{ state: DataState; save: (next: DataState) => Promise<void> } | undefined> {
  const env = (ctx as Ctx & { env?: { CHAT_DO?: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } } } }).env;
  if (!env?.CHAT_DO) return undefined;
  const stub = env.CHAT_DO.get(env.CHAT_DO.idFromName("student-records"));
  const response = await stub.fetch("https://do/data?key=" + encodeURIComponent(STATE_KEY));
  const state = response.status === 204 ? emptyState() : (await response.json()) as DataState;
  return { state, save: async (next) => { await stub.fetch("https://do/data?key=" + encodeURIComponent(STATE_KEY), { method: "PUT", body: JSON.stringify(next) }); } };
}

async function nodeRedisState(): Promise<{ state: DataState; save: (next: DataState) => Promise<void> } | undefined> {
  if (typeof process === "undefined" || !process.env.REDIS_URL) return undefined;
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  // ioredis is already a project dependency and only loads on the Node runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = require("ioredis");
  const Redis = mod.default ?? mod.Redis ?? mod;
  const client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const raw = await client.get(STATE_KEY);
  return {
    state: raw ? JSON.parse(raw) as DataState : emptyState(),
    save: async (next) => { await client.set(STATE_KEY, JSON.stringify(next)); await client.quit(); },
  };
}

async function withState<T>(ctx: Ctx, action: (state: DataState) => Promise<T> | T): Promise<T> {
  const persistent = await workerState(ctx) ?? await nodeRedisState();
  // The tokenless replay has no Worker binding or Redis. Its fresh grammY session
  // is deliberately isolated per spec; deployed calls always take a persistent backend above.
  const holder = ctx.session as DomainSession;
  const state = clone(persistent?.state ?? holder.__studentRecordsState ?? emptyState());
  const result = await action(state);
  if (persistent) await persistent.save(state);
  else holder.__studentRecordsState = state;
  return result;
}

export async function isAdmin(ctx: Ctx): Promise<boolean> {
  const owner = (await import("./toolkit/index.js")).isOwner(ctx);
  if (owner) return true;
  return withState(ctx, (state) => state.adminIds.includes(String(ctx.from?.id ?? "")));
}

export async function addAdmin(ctx: Ctx, chatId: string): Promise<void> {
  await withState(ctx, (state) => { if (!state.adminIds.includes(chatId)) state.adminIds.push(chatId); });
}

export async function listAdmins(ctx: Ctx): Promise<string[]> { return withState(ctx, (state) => [...state.adminIds]); }
export async function getStudent(ctx: Ctx, studentId: string): Promise<StudentRecord | undefined> { return withState(ctx, (state) => state.students[keyId(studentId)]); }
export async function listStudents(ctx: Ctx, status: StudentStatus): Promise<StudentRecord[]> { return withState(ctx, (state) => state.studentIds.map((id) => state.students[id]).filter((s) => s?.status === status)); }
export async function mappingFor(ctx: Ctx): Promise<TelegramUserMapping | undefined> { return withState(ctx, (state) => state.mappings[String(ctx.from?.id ?? "")]); }
export async function auditFor(ctx: Ctx, studentId: string): Promise<ChangeLog[]> { return withState(ctx, (state) => [...(state.auditByStudent[keyId(studentId)] ?? [])]); }

function audit(state: DataState, record: StudentRecord, by: string, type: string, oldValues: Record<string, string>, newValues: Record<string, string>): void {
  const entry: ChangeLog = { record_id: record.student_id, changed_by: by, change_type: type, old_values: oldValues, new_values: newValues, timestamp: now().toISOString() };
  (state.auditByStudent[record.student_id] ??= []).push(entry);
}

export async function createStudent(ctx: Ctx, input: Omit<StudentRecord, "version" | "created_at" | "updated_at">): Promise<StudentRecord | "exists"> {
  return withState(ctx, (state) => {
    const id = keyId(input.student_id);
    if (state.students[id]) return "exists";
    const timestamp = now().toISOString();
    const record: StudentRecord = { ...input, student_id: id, version: 1, created_at: timestamp, updated_at: timestamp };
    state.students[id] = record;
    state.studentIds.push(id);
    audit(state, record, String(ctx.from?.id ?? ""), "created", {}, { name: record.name, program: record.program, status: record.status });
    return record;
  });
}

export async function updateStudent(ctx: Ctx, studentId: string, changes: Partial<Pick<StudentRecord, "name" | "program" | "status" | "contact_info" | "preferred_contact" | "notes" | "enrollment_dates" | "exam_results" | "graduation_clearance">>, type: string): Promise<StudentRecord | undefined> {
  return withState(ctx, (state) => {
    const record = state.students[keyId(studentId)];
    if (!record) return undefined;
    const oldValues: Record<string, string> = {};
    const newValues: Record<string, string> = {};
    for (const [field, value] of Object.entries(changes)) {
      if (value !== undefined && record[field as keyof StudentRecord] !== value) {
        oldValues[field] = String(record[field as keyof StudentRecord] ?? "");
        newValues[field] = String(value);
        (record as unknown as Record<string, string>)[field] = value;
      }
    }
    if (Object.keys(newValues).length) {
      record.version += 1;
      record.updated_at = now().toISOString();
      audit(state, record, String(ctx.from?.id ?? ""), type, oldValues, newValues);
    }
    return record;
  });
}

export async function linkStudent(ctx: Ctx, studentId: string, code: string): Promise<"linked" | "invalid" | "used"> {
  return withState(ctx, (state) => {
    const record = state.students[keyId(studentId)];
    if (!record || !record.verification_code || record.verification_code !== code.trim()) return "invalid";
    const telegramId = String(ctx.from?.id ?? "");
    if (state.mappings[telegramId]?.verified) return "used";
    state.mappings[telegramId] = { telegram_id: telegramId, student_id: record.student_id, verified: true, linked_at: now().toISOString() };
    record.verification_code = undefined; // one-time code
    record.updated_at = now().toISOString();
    audit(state, record, telegramId, "account_linked", {}, { telegram_id: telegramId });
    return "linked";
  });
}

export async function notifyAdmin(ctx: Ctx, text: string): Promise<boolean> {
  const { adminChatId } = await import("./toolkit/index.js");
  const admin = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
  if (!admin) return false;
  try { await ctx.api.sendMessage(admin, text); return true; } catch { return false; }
}

export function diffText(record: StudentRecord, change: string): string {
  return `Student record updated\n${record.name} (${record.student_id})\n${change}\nOpen the bot to review the record.`;
}
