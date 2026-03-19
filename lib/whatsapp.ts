import "server-only";

import path from "path";
import { Client, LocalAuth, Message } from "whatsapp-web.js";

import { getDb } from "@/lib/mongodb";

type GroupSummary = {
  id: string;
  subject: string;
  participantCount: number;
};

type WhatsAppStatus = {
  connected: boolean;
  connection: string;
  lastQr?: string | null;
  user?: { id?: string; name?: string } | null;
};

type GlobalWhatsAppState = {
  __attandanceWhatsappClientPromise?: Promise<Client>;
};

const globalState = globalThis as unknown as GlobalWhatsAppState;

let lastQr: string | null = null;
let lastConnection: string = "close";
let connected = false;
let lastUser: WhatsAppStatus["user"] = null;

const senderNameCache = new Map<string, string>();

const GROUP_NAME_QUERY =
  process.env.WHATSAPP_GROUP_QUERY?.trim().toLowerCase() ??
  "stonewall infotech";

let targetGroupIds = new Set<string>();
const targetGroupNames = new Map<string, string>();

type InOut = "in" | "out";
type ParsedAttendance = {
  employee: string;
  action: InOut;
  half: 1 | 2;
  time: string; // HH:mm
};

type AttendanceFromBody = {
  action: InOut;
  half: 1 | 2;
  time: string; // HH:mm
};

const HALF2_CUTOFF_HOUR = 13; // 13:00 and above => Half2

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeText(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

type EmployeesCache = {
  names: string[];
  loadedAtMs: number;
};

let employeesCache: EmployeesCache = { names: ["Pal", "Hardik"], loadedAtMs: 0 };
const EMPLOYEES_CACHE_TTL_MS = 60_000;

async function refreshEmployeesFromDb(): Promise<string[]> {
  const now = Date.now();
  if (now - employeesCache.loadedAtMs < EMPLOYEES_CACHE_TTL_MS) {
    return employeesCache.names;
  }

  try {
    const db = await getDb();
    const docs = await db
      .collection<{ name: string }>("employees")
      .find({}, { projection: { _id: 0, name: 1 } })
      .toArray();

    const list = docs
      .map((d) => (typeof d?.name === "string" ? d.name.trim() : ""))
      .filter((n) => n.length > 0);

    const uniqueSorted = Array.from(new Set(list)).sort((a, b) =>
      a.localeCompare(b)
    );

    if (uniqueSorted.length > 0) {
      employeesCache = { names: uniqueSorted, loadedAtMs: now };
      return uniqueSorted;
    }
  } catch {
    // ignore and fallback to cached/default
  }

  employeesCache = { ...employeesCache, loadedAtMs: now };
  return employeesCache.names;
}

function matchEmployeeFromText(
  text: string,
  employees: string[]
): string | null {
  const t = normalizeText(text);
  for (const name of employees) {
    const n = normalizeText(name);
    if (!n) continue;
    if (t.includes(n)) return name;
  }
  return null;
}

function parseInOut(text: string): InOut | null {
  const t = normalizeText(text);
  if (/\bin\b/.test(t)) return "in";
  if (/\bout\b/.test(t)) return "out";
  return null;
}

function parseTimeAfterKeyword(text: string, action: InOut): string | null {
  const t = normalizeText(text);
  const keyword = action === "in" ? "in" : "out";
  const idx = t.indexOf(keyword);
  if (idx === -1) return null;

  const after = t.slice(idx + keyword.length).trim();

  // Matches: 9:30 / 9.30 / 9 : 30 / 9 :30
  const withColon = after.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})/);
  if (withColon) {
    const hh = Number(withColon[1]);
    const mm = Number(withColon[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && mm >= 0 && mm <= 59) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
  }

  // Matches: "9 19" or "12 38"
  const withSpace = after.match(/(\d{1,2})\s+(\d{1,2})/);
  if (withSpace) {
    const hh = Number(withSpace[1]);
    const mm = Number(withSpace[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && mm >= 0 && mm <= 59) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
  }

  // Fallback: hour only -> minutes = 00
  const hourOnly = after.match(/(\d{1,2})\b/);
  if (hourOnly) {
    const hh = Number(hourOnly[1]);
    if (Number.isFinite(hh)) return `${pad2(hh)}:00`;
  }

  return null;
}

function parseAttendanceFromBody(text: string): AttendanceFromBody | null {
  const action = parseInOut(text);
  if (!action) return null;

  const time = parseTimeAfterKeyword(text, action);
  if (!time) return null;

  const [hhRaw] = time.split(":");
  const hh = Number(hhRaw);
  if (!Number.isFinite(hh)) return null;

  const half: 1 | 2 = hh >= HALF2_CUTOFF_HOUR ? 2 : 1;
  return { action, half, time };
}

function timestampToISODate(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

async function upsertAttendance(parsed: ParsedAttendance, date: string): Promise<void> {
  const db = await getDb();
  const collection = db.collection("attendance");

  const halfKey = parsed.half === 1 ? "half1" : "half2";
  const inOutField = `${halfKey}.${parsed.action}`;

  const set: Record<string, string | boolean | Date> = {
    status: "working",
    [`${halfKey}.enabled`]: true,
    [inOutField]: parsed.time,
    updatedAt: new Date(),
  };

  await collection.updateOne(
    { employee: parsed.employee, date },
    { $set: set },
    { upsert: true }
  );
}

function extractChatId(chat: unknown): string {
  const c = chat as unknown as {
    id?: unknown;
    isGroup?: boolean;
  };
  const idVal = c.id;
  if (!idVal) return "";
  if (typeof idVal === "string") return idVal;
  if (typeof idVal === "object") {
    const idObj = idVal as { _serialized?: unknown };
    if (typeof idObj._serialized === "string") return idObj._serialized;
  }
  return "";
}

async function refreshTargetGroupIds(client: Client): Promise<void> {
  try {
    const chats = await client.getChats();
    const ids = new Set<string>();
    const names = new Map<string, string>();

    for (const chat of chats) {
      const c = chat as unknown as {
        isGroup?: boolean;
        name?: unknown;
      };
      const chatId = extractChatId(chat);
      if (!chatId.endsWith("@g.us")) continue;

      const name = typeof c.name === "string" ? c.name.toLowerCase() : "";
      if (name.includes(GROUP_NAME_QUERY)) ids.add(chatId);
      if (name.includes(GROUP_NAME_QUERY) && typeof c.name === "string") {
        names.set(chatId, c.name);
      }
    }

    targetGroupIds = ids;
    targetGroupNames.clear();
    for (const [id, name] of names.entries()) targetGroupNames.set(id, name);
  } catch {
    // ignore; group filtering will fallback to empty set (log nothing)
    targetGroupIds = new Set<string>();
    targetGroupNames.clear();
  }
}

function authDir() {
  // Keep auth inside project folder; persists across dev restarts
  return path.join(process.cwd(), ".wwebjs_auth");
}

function getMessagePreview(message: Message): string {
  const body = typeof message?.body === "string" ? message.body.trim() : "";
  if (body) return body.length > 400 ? `${body.slice(0, 400)}...` : body;

  const caption = (() => {
    const cap = (message as unknown as { caption?: string }).caption;
    return typeof cap === "string" ? cap.trim() : "";
  })();
  if (caption)
    return caption.length > 400 ? `${caption.slice(0, 400)}...` : caption;

  const type = typeof message?.type === "string" ? message.type : "unknown";
  return `(type: ${type})`;
}

function getSenderId(message: Message): string {
  // For group messages, `author` is the sender. For 1:1, use `from`.
  const author = message?.author;
  if (typeof author === "string" && author.trim().length > 0) return author;
  const from = message?.from;
  if (typeof from === "string" && from.trim().length > 0) return from;
  return "unknown";
}

async function getSenderName(
  client: Client,
  message: Message,
  senderId: string
) {
  const cached = senderNameCache.get(senderId);
  if (cached) return cached;

  // Prefer message.getContact() if available (often returns the author contact in groups)
  try {
    if (typeof message?.getContact === "function") {
      const contact = await message.getContact();
      const pushName =
        typeof contact?.pushname === "string" ? contact.pushname.trim() : "";
      if (pushName) {
        senderNameCache.set(senderId, pushName);
        return pushName;
      }
    }
  } catch {
    // ignore
  }

  // Fallback: direct contact lookup
  try {
    const contact = await client.getContactById(senderId);
    const pushName =
      typeof contact?.pushname === "string" ? contact.pushname.trim() : "";
    if (pushName) {
      senderNameCache.set(senderId, pushName);
      return pushName;
    }
  } catch {
    // ignore
  }

  const fallback = senderId.includes("@") ? senderId.split("@")[0] : senderId;
  senderNameCache.set(senderId, fallback);
  return fallback;
}

async function destroyClient(): Promise<void> {
  const existing = globalState.__attandanceWhatsappClientPromise;
  if (existing) {
    try {
      const client = await existing;
      await client.destroy();
    } catch {
      // ignore
    }
  }
  globalState.__attandanceWhatsappClientPromise = undefined;
  lastQr = null;
  lastConnection = "close";
  connected = false;
  lastUser = null;
}

function createAndInitClient(pairWithPhoneNumber?: { phoneNumber: string }) {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: "default",
      dataPath: authDir(),
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
    ...(pairWithPhoneNumber && { pairWithPhoneNumber }),
  });

  client.on("qr", (qr: string) => {
    lastQr = String(qr);
    lastConnection = "qr";
    connected = false;
  });

  client.on("code", (code: string) => {
    lastConnection = "pairing";
    connected = false;
  });

  client.on("ready", () => {
    connected = true;
    lastConnection = "ready";
    lastQr = null;
    try {
      const info = (
        client as unknown as {
          info?: {
            wid?: { user?: string; _serialized?: string };
            pushname?: string;
          };
        }
      ).info;
      lastUser = {
        id: info?.wid?.user ?? info?.wid?._serialized,
        name: info?.pushname ?? info?.wid?.user,
      };
    } catch {
      // ignore
    }
    void refreshTargetGroupIds(client);
  });

  client.on("authenticated", () => {
    lastConnection = "authenticated";
  });

  client.on("auth_failure", () => {
    connected = false;
    lastConnection = "auth_failure";
  });

  client.on("disconnected", () => {
    connected = false;
    lastConnection = "disconnected";
  });

  client.on("message", async (message: Message) => {
    try {
      const messageChatId = typeof message.from === "string" ? message.from : "";
      if (targetGroupIds.size === 0) {
        await refreshTargetGroupIds(client);
      }
      if (!targetGroupIds.has(messageChatId)) return;

      const senderId = getSenderId(message);
      const senderName = await getSenderName(client, message, senderId);
      const groupName =
        targetGroupNames.get(messageChatId) ?? "Group";
      const fromMe = !!message?.fromMe;
      const preview = getMessagePreview(message);

      const bodyText = typeof message.body === "string" ? message.body : "";
      const parsedAttendanceBody = parseAttendanceFromBody(bodyText);

      if (parsedAttendanceBody) {
        const employees = await refreshEmployeesFromDb();
        const employee =
          matchEmployeeFromText(senderName, employees) ??
          matchEmployeeFromText(bodyText, employees);
        if (employee) {
          const ts =
            typeof message.timestamp === "number"
              ? message.timestamp
              : Math.floor(Date.now() / 1000);
          const date = timestampToISODate(ts);
          const parsedAttendance: ParsedAttendance = {
            employee,
            ...parsedAttendanceBody,
          };

          await upsertAttendance(parsedAttendance, date);

          console.log(
            `[Attendance][${date}] ${parsedAttendance.employee} ${parsedAttendance.action.toUpperCase()} ${parsedAttendance.time} (Half${parsedAttendance.half})`
          );
        }
      }

      console.log(
        `[WhatsApp][${groupName}] ${fromMe ? "sent" : "received"} from ${senderName} (${senderId}): ${preview}`
      );
    } catch {
      // ignore
    }
  });

  client.initialize();
  return client;
}

async function ensureClient() {
  const existing = globalState.__attandanceWhatsappClientPromise;
  if (existing) return existing;

  globalState.__attandanceWhatsappClientPromise = Promise.resolve(
    createAndInitClient()
  );

  return globalState.__attandanceWhatsappClientPromise;
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return {
    connected,
    connection: lastConnection,
    lastQr,
    user: lastUser,
  };
}

export async function startWhatsApp(): Promise<void> {
  await ensureClient();
}

export async function getQrString(): Promise<string | null> {
  await ensureClient();
  return lastQr;
}

export async function requestPairingCode(
  phoneNumber: string
): Promise<{ code: string } | { error: string }> {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length < 10) {
    return { error: "Enter a valid phone number with country code (e.g. 919876543210)" };
  }

  if (connected) {
    return { error: "Already connected" };
  }

  try {
    await destroyClient();
  } catch {
    // ignore
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ error: "Timed out waiting for pairing code (try again in 30–60 seconds)" });
    }, 90_000);

    const client = createAndInitClient({
      phoneNumber: digits,
      showNotification: true,
      intervalMs: 180_000,
    });

    globalState.__attandanceWhatsappClientPromise = Promise.resolve(client);

    client.once("code", (code: string) => {
      clearTimeout(timeout);
      resolve({ code });
    });

    client.once("auth_failure", () => {
      clearTimeout(timeout);
      resolve({ error: "Authentication failed" });
    });
  });
}

export async function getGroupByName(
  groupNameQuery: string
): Promise<GroupSummary | null> {
  const client = await ensureClient();
  if (!connected) return null;

  const query = groupNameQuery.trim().toLowerCase();
  const chats = await client.getChats();

  const groupChats = chats.filter((c) => {
    const cAny = c as unknown as {
      isGroup?: boolean;
      id?: unknown;
      name?: unknown;
      participants?: unknown;
    };
    const chatId = typeof cAny.id === "string" ? cAny.id : String(cAny.id ?? "");
    return !!cAny.isGroup || chatId.endsWith("@g.us");
  });

  const match = groupChats.find((c) => {
    const cAny = c as unknown as { name?: unknown };
    const name = typeof cAny.name === "string" ? cAny.name.toLowerCase() : "";
    return name.includes(query);
  });

  if (!match) return null;

  const matchAny = match as unknown as { participants?: unknown; id?: unknown; name?: unknown };
  const participantCount = Array.isArray(matchAny.participants)
    ? matchAny.participants.length
    : 0;

  return {
    id: (() => {
      const idVal = matchAny.id as unknown;
      if (typeof idVal === "string") return idVal;
      if (idVal && typeof idVal === "object") {
        const idObj = idVal as { _serialized?: unknown };
        if (typeof idObj._serialized === "string") return idObj._serialized;
      }
      return "";
    })(),
    subject: typeof matchAny.name === "string" ? matchAny.name : "",
    participantCount,
  };
}

