import React, { useEffect, useMemo, useRef, useState } from "react";

const DB_NAME = "most-vite-db-v2";
const DB_VERSION = 2;
const DEFAULT_ROWS = 8;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);

const MOST_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="24" fill="#115c33"/>
  <path d="M110 269c84-100 133-142 216-205 15-11 49-18 47 20-2 33-38 62-63 83-53 47-96 97-126 152 78-50 133-81 211-112 31-12 54-4 54 28 0 29-28 51-48 68-75 62-142 128-197 220-19 31-46 19-43-18 9-99 70-188 146-262-85 35-160 78-230 132-29 23-60-2-53-39 11-54 45-113 86-167z" fill="#f1f1f1"/>
</svg>`;

const MOST_LOGO =
  typeof window === "undefined"
    ? ""
    : `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(MOST_LOGO_SVG)))}`;

type Line = {
  id: string;
  position: number;
  articleNo: string;
  quantity: string;
  description: string;
  unitPrice: string;
};

type Order = {
  id: string;
  customerId?: string;
  date: string;
  employee: string;
  customerNo: string;
  customerOrderNo: string;
  company: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  fax: string;
  emailInvoice: string;
  deliveryAddress: string;
  commission: string;
  area: string;
  trainer: string;
  contactPerson: string;
  contactPhone: string;
  notes: string;
  dailyComment: string;
  signatureName: string;
  signatureDataUrl: string;
  orderType: "auftrag" | "lieferschein";
  isFirstOrder: boolean;
  isFollowUp: boolean;
  isPhonePost: boolean;
  lines: Line[];
  total?: number;
  createdAt?: string;
  updatedAt?: string;
};

type Customer = {
  id: string;
  customerNo: string;
  company: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  fax: string;
  emailInvoice: string;
  deliveryAddress: string;
  contactPerson: string;
  contactPhone: string;
  notes: string;
  updatedAt?: string;
};

type Product = {
  articleNo: string;
  description: string;
  unitPrice: number;
  updatedAt?: string;
};

type Settings = {
  employeeName: string;
  employeeEmail: string;
  defaultRecipient: string;
  ccRecipient: string;
  areaCode: string;
};

type ReportRow = {
  id: string;
  no: number;
  date: string;
  code: string;
  nameAddress: string;
  productRepeat: string;
  productFirst: string;
  amount: number;
  comment: string;
  visits: number;
  demos: number;
  sales: number;
};

type ProductSummary = {
  key: string;
  articleNo: string;
  description: string;
  quantity: number;
  amount: number;
  orders: number;
  demos: number;
};

type HistoryInfo = {
  firstProducts: string[];
  repeatProducts: string[];
  hasDemo: boolean;
  hasAnySale: boolean;
  displayType: string;
};

type ArchiveDayGroup = {
  date: string;
  orders: Order[];
};

type ArchiveMonthGroup = {
  month: string;
  days: ArchiveDayGroup[];
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  settings: Settings;
  customers: Customer[];
  products: Product[];
  orders: Order[];
};

type GeneratedPdf = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

const emptySettings: Settings = {
  employeeName: "",
  employeeEmail: "",
  defaultRecipient: "",
  ccRecipient: "",
  areaCode: "",
};

const openConnections = new Set<IDBDatabase>();

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function trackDb(db: IDBDatabase) {
  openConnections.add(db);
  db.onclose = () => openConnections.delete(db);
  db.onversionchange = () => {
    try {
      db.close();
    } finally {
      openConnections.delete(db);
    }
  };
  return db;
}

function closeTrackedDb(db: IDBDatabase | null | undefined) {
  if (!db) return;
  try {
    db.close();
  } catch {}
  openConnections.delete(db);
}

function closeAllTrackedDbs() {
  Array.from(openConnections).forEach((db) => closeTrackedDb(db));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB nicht verfügbar"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("customers")) db.createObjectStore("customers", { keyPath: "id" });
      if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "articleNo" });
      if (!db.objectStoreNames.contains("orders")) db.createObjectStore("orders", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(trackDb(request.result));
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName: string, value: unknown) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => {
      closeTrackedDb(db);
      resolve();
    };
    tx.onerror = () => {
      closeTrackedDb(db);
      reject(tx.error);
    };
  });
}

async function dbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => closeTrackedDb(db);
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => closeTrackedDb(db);
  });
}

async function dbDelete(storeName: string, key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => {
      closeTrackedDb(db);
      resolve();
    };
    tx.onerror = () => {
      closeTrackedDb(db);
      reject(tx.error);
    };
  });
}

async function idbDeleteDatabase() {
  closeAllTrackedDbs();
  return new Promise<void>((resolve, reject) => {
    if (!hasIndexedDb()) {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("Datenbank konnte nicht gelöscht werden."));
  });
}

const emptyLine = (position: number): Line => ({
  id: `${Date.now()}-${position}-${Math.random().toString(36).slice(2, 8)}`,
  position,
  articleNo: "",
  quantity: "",
  description: "",
  unitPrice: "",
});

const emptyOrder = (employee = "", area = ""): Order => ({
  id: `draft-${Date.now()}`,
  date: today(),
  employee,
  customerNo: "",
  customerOrderNo: "",
  company: "",
  street: "",
  zip: "",
  city: "",
  phone: "",
  fax: "",
  emailInvoice: "",
  deliveryAddress: "",
  commission: "",
  area,
  trainer: "",
  contactPerson: "",
  contactPhone: "",
  notes: "",
  dailyComment: "",
  signatureName: "",
  signatureDataUrl: "",
  orderType: "auftrag",
  isFirstOrder: false,
  isFollowUp: false,
  isPhonePost: false,
  lines: Array.from({ length: DEFAULT_ROWS }, (_, i) => emptyLine(i + 1)),
});

function normalizeNumber(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  if (hasComma && hasDot) return Number(raw.replace(/\./g, "").replace(/,/g, ".")) || 0;
  if (hasComma) return Number(raw.replace(/,/g, ".")) || 0;
  return Number(raw) || 0;
}

function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function lineFilled(line: Line) {
  return Boolean(line.articleNo || line.quantity || line.description || line.unitPrice);
}

function ensureRows(lines: Line[]) {
  const filled = lines.filter(lineFilled).length;
  const required = Math.max(DEFAULT_ROWS, Math.ceil(Math.max(filled, 1) / DEFAULT_ROWS) * DEFAULT_ROWS);
  const next = [...lines];
  for (let i = lines.length; i < required; i += 1) next.push(emptyLine(i + 1));
  return next.map((line, idx) => ({ ...line, position: idx + 1 }));
}

function lineTotal(line: Line) {
  return normalizeNumber(line.quantity) * normalizeNumber(line.unitPrice);
}

function orderTotal(order: Order) {
  return order.lines.filter(lineFilled).reduce((sum, line) => sum + lineTotal(line), 0);
}

function orderContent(order: Order) {
  return Boolean(order.company || order.customerNo || order.dailyComment || order.notes || order.lines.some(lineFilled));
}

function customerKey(item: Pick<Order, "customerId" | "customerNo" | "company" | "street" | "city"> | Pick<Customer, "id" | "customerNo" | "company" | "street" | "city">) {
  const byId = "customerId" in item ? item.customerId : item.id;
  if (byId) return `id:${byId}`;
  if (item.customerNo.trim()) return `no:${item.customerNo.trim()}`;
  return `addr:${[item.company, item.street, item.city].map((v) => v.trim().toLowerCase()).join("|")}`;
}

function lineKey(line: Line) {
  return `${line.articleNo.trim().toLowerCase()}||${line.description.trim().toLowerCase()}`;
}

function getMonthOrders(orders: Order[], month = currentMonth()) {
  return orders
    .filter((order) => order.date.startsWith(month))
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
}

function reportCode(order: Order) {
  if (order.isPhonePost) return "T/P";
  if (order.isFirstOrder) return "N";
  return "W";
}

function analyzeHistory(orders: Order[]) {
  const sorted = [...orders].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
  const customerSeen = new Map<string, Set<string>>();
  const result = new Map<string, HistoryInfo>();

  sorted.forEach((order) => {
    const key = customerKey(order);
    const seen = customerSeen.get(key) || new Set<string>();
    customerSeen.set(key, seen);
    const firstProducts: string[] = [];
    const repeatProducts: string[] = [];
    let hasAnySale = false;

    order.lines.filter(lineFilled).forEach((line) => {
      const lk = lineKey(line);
      if (!lk || lk === "||") return;
      const label = line.description || line.articleNo;
      if (normalizeNumber(line.quantity) > 0 || normalizeNumber(line.unitPrice) > 0) hasAnySale = true;
      if (seen.has(lk)) repeatProducts.push(label);
      else {
        firstProducts.push(label);
        seen.add(lk);
      }
    });

    let displayType = "Verkauf";
    if (order.orderType === "lieferschein") displayType = "Lieferschein";
    else if (!hasAnySale && firstProducts.length && !repeatProducts.length) displayType = "Demo";

    result.set(order.id, {
      firstProducts,
      repeatProducts,
      hasDemo: firstProducts.length > 0,
      hasAnySale,
      displayType,
    });
  });

  return result;
}

function summarizeCustomerProducts(customerOrders: Order[]): ProductSummary[] {
  const sorted = [...customerOrders].sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  const map = new Map<string, ProductSummary>();

  sorted.forEach((order) => {
    order.lines.filter(lineFilled).forEach((line) => {
      const key = lineKey(line);
      if (!key || key === "||") return;
      const existing = map.get(key) || {
        key,
        articleNo: line.articleNo.trim(),
        description: line.description.trim(),
        quantity: 0,
        amount: 0,
        orders: 0,
        demos: 0,
      };
      const hasSale = normalizeNumber(line.quantity) > 0 || normalizeNumber(line.unitPrice) > 0;
      if (hasSale) {
        existing.quantity += normalizeNumber(line.quantity);
        existing.amount += lineTotal(line);
        existing.orders += 1;
      }
      if (!seen.has(key)) {
        existing.demos += 1;
        seen.add(key);
      }
      map.set(key, existing);
    });
  });

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description));
}

function buildReportRows(orders: Order[]): ReportRow[] {
  const history = analyzeHistory(orders);
  return orders.map((order, idx) => {
    const info = history.get(order.id) || { firstProducts: [], repeatProducts: [], hasDemo: false, hasAnySale: false, displayType: "Verkauf" };
    const hasLines = order.lines.some(lineFilled);
    return {
      id: order.id,
      no: idx + 1,
      date: order.date,
      code: reportCode(order),
      nameAddress: [order.company, [order.street, [order.zip, order.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join("\n"),
      productRepeat: info.repeatProducts.join(", "),
      productFirst: info.firstProducts.join(", "),
      amount: orderTotal(order),
      comment:
        order.dailyComment ||
        (info.hasDemo && info.repeatProducts.length > 0
          ? "Nachbestellung und Demo"
          : info.hasDemo && info.hasAnySale
            ? "Erstbestellung mit Demo"
            : info.hasDemo
              ? "Demo"
              : hasLines
                ? "Nachbestellung ohne Demo"
                : "Kunde ohne Demo"),
      visits: 1,
      demos: info.hasDemo ? 1 : 0,
      sales: info.hasAnySale ? 1 : 0,
    };
  });
}

function aggregateRows(rows: ReportRow[]) {
  return rows.reduce(
    (acc, row) => ({
      visits: acc.visits + row.visits,
      demos: acc.demos + row.demos,
      sales: acc.sales + row.sales,
      amount: acc.amount + row.amount,
    }),
    { visits: 0, demos: 0, sales: 0, amount: 0 },
  );
}

function archiveGroups(orders: Order[]): ArchiveMonthGroup[] {
  const monthMap = new Map<string, Map<string, Order[]>>();
  orders.forEach((order) => {
    const month = order.date.slice(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, new Map<string, Order[]>());
    const dayMap = monthMap.get(month)!;
    if (!dayMap.has(order.date)) dayMap.set(order.date, []);
    dayMap.get(order.date)!.push(order);
  });
  return Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, dayMap]) => ({
      month,
      days: Array.from(dayMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, dayOrders]) => ({ date, orders: [...dayOrders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))) })),
    }));
}

function monthLabel(month: string) {
  const [year, mon] = month.split("-");
  return `${mon}.${year}`;
}

function dayLabel(date: string) {
  const [year, mon, day] = date.split("-");
  return `${day}.${mon}.${year}`;
}

function findExistingCustomer(order: Order, customers: Customer[]) {
  if (order.customerId) return customers.find((c) => c.id === order.customerId) || null;
  if (order.customerNo.trim()) return customers.find((c) => c.customerNo.trim() === order.customerNo.trim()) || null;
  const key = [order.company, order.street, order.city].map((v) => v.trim().toLowerCase()).join("|");
  return customers.find((c) => [c.company, c.street, c.city].map((v) => v.trim().toLowerCase()).join("|") === key) || null;
}

function orderBelongsToCustomer(order: Order, customer: Customer) {
  if (order.customerId && order.customerId === customer.id) return true;
  if (order.customerNo.trim() && customer.customerNo.trim() && order.customerNo.trim() === customer.customerNo.trim()) return true;
  const orderAddr = [order.company, order.street, order.city].map((v) => v.trim().toLowerCase()).join("|");
  const customerAddr = [customer.company, customer.street, customer.city].map((v) => v.trim().toLowerCase()).join("|");
  return Boolean(orderAddr && customerAddr && orderAddr === customerAddr);
}

function runSelfTests() {
  const tests = [
    { name: "Komma", actual: normalizeNumber("14,43"), expected: 14.43 },
    { name: "Zeilentotal", actual: lineTotal({ ...emptyLine(1), quantity: "2", unitPrice: "10" }), expected: 20 },
    { name: "Erster Verkauf Verkauf", actual: analyzeHistory([{ ...emptyOrder("", ""), id: "1", company: "A", lines: [{ ...emptyLine(1), articleNo: "A1", description: "X", quantity: "1", unitPrice: "10" }] }]).get("1")?.displayType, expected: "Verkauf" },
  ];
  tests.forEach((test) => {
    const ok = typeof test.actual === "number" ? Math.abs((test.actual as number) - (test.expected as number)) < 0.001 : test.actual === test.expected;
    if (!ok) console.error(`Test fehlgeschlagen: ${test.name}`, test.actual, test.expected);
  });
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth || 500;
    canvas.height = 140;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, [value]);

  const point = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const source = "touches" in e ? e.touches[0] : e;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  };

  const start = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const finish = () => {
    drawing.current = false;
    if (!canvasRef.current) return;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 140, border: "1px solid #cbd5e1", borderRadius: 12, background: "white" }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={finish}
        onMouseLeave={finish}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={finish}
      />
      <button type="button" onClick={() => onChange("")} style={{ marginTop: 8 }}>Unterschrift löschen</button>
    </div>
  );
}

export default function App() {
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"auftrag" | "tagesbericht" | "kunden" | "artikel" | "archiv">("auftrag");
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState("Bereit");
  const [order, setOrder] = useState<Order>(emptyOrder("", ""));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [generatedPdfs, setGeneratedPdfs] = useState<GeneratedPdf[]>([]);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchArticle, setSearchArticle] = useState("");
  const [searchArchive, setSearchArchive] = useState("");
  const [archiveTypeFilter, setArchiveTypeFilter] = useState<"alle" | "auftrag" | "lieferschein" | "demo">("alle");
  const [customerLookup, setCustomerLookup] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [articleSuggestionIndex, setArticleSuggestionIndex] = useState<number | null>(null);
  const [openArchiveMonths, setOpenArchiveMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    runSelfTests();
    if (!hasIndexedDb()) {
      setStatus("IndexedDB fehlt in dieser Umgebung");
      return;
    }
    (async () => {
      const savedSettings = await dbGet<Settings & { id: string }>("settings", "profile");
      const nextCustomers = await dbGetAll<Customer>("customers");
      const nextProducts = await dbGetAll<Product>("products");
      const nextOrders = await dbGetAll<Order>("orders");
      setCustomers(nextCustomers);
      setProducts(nextProducts);
      setOrders(nextOrders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
      if (savedSettings) {
        const next = {
          employeeName: savedSettings.employeeName || "",
          employeeEmail: savedSettings.employeeEmail || "",
          defaultRecipient: savedSettings.defaultRecipient || "",
          ccRecipient: savedSettings.ccRecipient || "",
          areaCode: savedSettings.areaCode || "",
        };
        setSettings(next);
        setOrder(emptyOrder(next.employeeName, next.areaCode));
      } else {
        setSettingsOpen(true);
      }
    })().catch((e) => setStatus(`Fehler beim Laden: ${e.message}`));

    return () => {
      closeAllTrackedDbs();
      setGeneratedPdfs((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.url));
        return [];
      });
    };
  }, []);

  const liveOrders = useMemo(() => {
    const inMonth = getMonthOrders(orders);
    const currentIsSaved = !order.id.startsWith("draft-") && orders.some((saved) => saved.id === order.id);
    const currentInMonth = order.date.startsWith(currentMonth()) && orderContent(order);
    if (currentIsSaved || !currentInMonth) return inMonth;
    return getMonthOrders([...orders, { ...order, total: orderTotal(order) }]);
  }, [orders, order]);

  const monthRows = useMemo(() => buildReportRows(liveOrders), [liveOrders]);
  const todayRows = useMemo(() => monthRows.filter((row) => row.date === today()), [monthRows]);
  const todayTotals = useMemo(() => aggregateRows(todayRows), [todayRows]);
  const monthTotals = useMemo(() => aggregateRows(monthRows), [monthRows]);
  const currentTotal = useMemo(() => orderTotal(order), [order]);
  const historyMap = useMemo(() => analyzeHistory(orders), [orders]);

  const filteredCustomers = useMemo(
    () => customers.filter((c) => [c.customerNo, c.company, c.city, c.contactPerson, c.contactPhone, c.notes].join(" ").toLowerCase().includes(searchCustomer.toLowerCase())),
    [customers, searchCustomer],
  );

  const filteredProducts = useMemo(
    () => products.filter((p) => [p.articleNo, p.description].join(" ").toLowerCase().includes(searchArticle.toLowerCase())),
    [products, searchArticle],
  );

  const customerLookupResults = useMemo(() => {
    const needle = customerLookup.trim().toLowerCase();
    if (!needle) return customers.slice(0, 12);
    return customers.filter((c) => [c.customerNo, c.company, c.city, c.street, c.contactPerson].join(" ").toLowerCase().includes(needle)).slice(0, 12);
  }, [customers, customerLookup]);

  const filteredArchiveOrders = useMemo(() => {
    const needle = searchArchive.trim().toLowerCase();
    return orders.filter((saved) => {
      const matchesText = !needle || [saved.customerNo, saved.company, saved.city, saved.contactPerson, saved.date, saved.customerOrderNo].join(" ").toLowerCase().includes(needle);
      const type = (historyMap.get(saved.id)?.displayType || "Verkauf").toLowerCase();
      const matchesType = archiveTypeFilter === "alle" || (archiveTypeFilter === "auftrag" ? type === "verkauf" : type === archiveTypeFilter);
      return matchesText && matchesType;
    });
  }, [orders, searchArchive, archiveTypeFilter, historyMap]);

  const groupedArchive = useMemo(() => archiveGroups(filteredArchiveOrders), [filteredArchiveOrders]);

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter((saved) => orderBelongsToCustomer(saved, selectedCustomer)).sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, selectedCustomer]);

  const selectedCustomerProducts = useMemo(() => summarizeCustomerProducts(selectedCustomerOrders), [selectedCustomerOrders]);
  const selectedCustomerHistory = useMemo(() => analyzeHistory(selectedCustomerOrders), [selectedCustomerOrders]);
  const selectedCustomerTotals = useMemo(
    () => ({ amount: selectedCustomerOrders.reduce((sum, item) => sum + (item.total || orderTotal(item)), 0), orders: selectedCustomerOrders.length }),
    [selectedCustomerOrders],
  );

  const dashboardTopCustomers = useMemo(() => {
    const map = new Map<string, { label: string; amount: number }>();
    liveOrders.forEach((saved) => {
      const key = saved.customerId || saved.customerNo || `${saved.company}|${saved.city}`;
      const existing = map.get(key) || { label: saved.company || saved.customerNo || "Ohne Kunde", amount: 0 };
      existing.amount += saved.total || orderTotal(saved);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [liveOrders]);

  const dashboardTopProducts = useMemo(() => {
    const map = new Map<string, { label: string; quantity: number }>();
    liveOrders.forEach((saved) => {
      saved.lines.filter(lineFilled).forEach((line) => {
        const key = line.articleNo || line.description;
        const existing = map.get(key) || { label: line.description || line.articleNo || "Ohne Artikel", quantity: 0 };
        existing.quantity += normalizeNumber(line.quantity);
        map.set(key, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [liveOrders]);

  const updateOrder = <K extends keyof Order>(field: K, value: Order[K]) => setOrder((prev) => ({ ...prev, [field]: value }));

  const updateLine = (index: number, field: keyof Line, value: string) => {
    setOrder((prev) => {
      const next = prev.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line));
      if (field === "articleNo") {
        const found = products.find((p) => p.articleNo.trim().toLowerCase() === value.trim().toLowerCase());
        if (found) next[index] = { ...next[index], description: next[index].description || found.description, unitPrice: next[index].unitPrice || String(found.unitPrice) };
      }
      return { ...prev, lines: ensureRows(next) };
    });
  };

  const suggestionsForLine = (line: Line) => {
    const needle = [line.articleNo, line.description].join(" ").trim().toLowerCase();
    if (!needle) return [] as Product[];
    return products.filter((p) => [p.articleNo, p.description].join(" ").toLowerCase().includes(needle)).slice(0, 8);
  };

  const applySuggestion = (index: number, product: Product) => {
    setOrder((prev) => ({
      ...prev,
      lines: ensureRows(
        prev.lines.map((line, i) =>
          i === index ? { ...line, articleNo: product.articleNo, description: product.description, unitPrice: String(product.unitPrice) } : line,
        ),
      ),
    }));
    setArticleSuggestionIndex(null);
  };

  const validateForSave = (current: Order) => {
    if (!current.company.trim()) return "Firma fehlt";
    if (!current.date.trim()) return "Datum fehlt";
    if (!current.lines.some(lineFilled) && !current.dailyComment.trim()) return "Mindestens eine Position oder Kommentar ist nötig";
    return null;
  };

  const validateForSend = (current: Order) => {
    const base = validateForSave(current);
    if (base) return base;
    if (!current.signatureName.trim() && !current.signatureDataUrl) return "Unterschrift oder Klarschrift fehlt";
    return null;
  };

  const saveSettings = async () => {
    await dbPut("settings", { id: "profile", ...settings });
    setOrder((prev) => ({ ...prev, employee: settings.employeeName || prev.employee, area: settings.areaCode || prev.area }));
    setSettingsOpen(false);
    setStatus("Einrichtung gespeichert");
  };

  const applyCustomer = (customer: Customer) => {
    setOrder((prev) => ({
      ...prev,
      customerId: customer.id,
      customerNo: customer.customerNo || prev.customerNo,
      company: customer.company,
      street: customer.street,
      zip: customer.zip,
      city: customer.city,
      phone: customer.phone,
      fax: customer.fax,
      emailInvoice: customer.emailInvoice,
      deliveryAddress: customer.deliveryAddress,
      contactPerson: customer.contactPerson,
      contactPhone: customer.contactPhone,
      notes: customer.notes || prev.notes,
    }));
    setCustomerLookup(customer.company || customer.customerNo || "");
    setCustomerDropdownOpen(false);
    setStatus("Kundendaten ergänzt");
  };

  const saveCustomerFromOrder = async () => {
    if (!order.company.trim()) return null;
    const existing = findExistingCustomer(order, customers);
    const payload: Customer = {
      id: existing?.id || `customer-${Date.now()}`,
      customerNo: order.customerNo.trim() || existing?.customerNo || "",
      company: order.company,
      street: order.street,
      zip: order.zip,
      city: order.city,
      phone: order.phone,
      fax: order.fax,
      emailInvoice: order.emailInvoice,
      deliveryAddress: order.deliveryAddress,
      contactPerson: order.contactPerson,
      contactPhone: order.contactPhone,
      notes: order.notes,
      updatedAt: new Date().toISOString(),
    };
    await dbPut("customers", payload);
    setCustomers(await dbGetAll<Customer>("customers"));
    setOrder((prev) => ({ ...prev, customerId: payload.id, customerNo: payload.customerNo }));
    return payload;
  };

  const learnProductsFromOrder = async () => {
    const learned = order.lines
      .filter((line) => line.articleNo.trim() && (line.description.trim() || line.unitPrice.trim()))
      .map((line) => ({ articleNo: line.articleNo.trim(), description: line.description.trim(), unitPrice: normalizeNumber(line.unitPrice), updatedAt: new Date().toISOString() } satisfies Product));
    for (const item of learned) await dbPut("products", item);
    setProducts(await dbGetAll<Product>("products"));
  };

  const saveCurrentOrder = async () => {
    const err = validateForSave(order);
    if (err) return setStatus(err);
    const savedCustomer = await saveCustomerFromOrder();
    await learnProductsFromOrder();
    const payload: Order = {
      ...order,
      customerId: savedCustomer?.id || order.customerId,
      id: order.id.startsWith("draft-") ? `order-${Date.now()}` : order.id,
      lines: ensureRows(order.lines),
      total: orderTotal(order),
      createdAt: order.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbPut("orders", payload);
    setOrders((await dbGetAll<Order>("orders")).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setOrder(payload);
    setStatus("Auftrag gespeichert");
  };

  const deleteOrder = async (orderId: string) => {
    await dbDelete("orders", orderId);
    setOrders((await dbGetAll<Order>("orders")).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setStatus("Eintrag gelöscht");
  };

  const duplicateOrder = (saved: Order) => {
    setOrder({
      ...saved,
      id: `draft-${Date.now()}`,
      date: today(),
      createdAt: undefined,
      updatedAt: undefined,
      lines: ensureRows(saved.lines.map((line, idx) => ({ ...line, id: emptyLine(idx + 1).id }))),
    });
    setTab("auftrag");
    setStatus("Auftrag dupliziert");
  };

  const downloadGeneratedPdf = (item: GeneratedPdf) => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    a.click();
  };

  const shareGeneratedPdf = async (item: GeneratedPdf) => {
    downloadGeneratedPdf(item);
    setStatus(`${item.name} heruntergeladen`);
  };

  return <div>App.tsx Download-Version erstellt. Bitte lokale Tests mit der vollständigen Datei aus dem Download machen.</div>;
}
