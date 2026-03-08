import React, { useEffect, useMemo, useRef, useState } from "react";

const DB_NAME = "most-vite-db-v13";
const DB_VERSION = 2;
const DEFAULT_ROWS = 14;

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

type GeneratedPdf = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

type PlannedCustomer = {
  id: string;
  customerId: string;
  plannedProducts: string;
  notes: string;
  isDone: boolean;
  sortOrder: number;
  addedAt: string;
};

type DayPlan = {
  id: string;
  date: string;
  zipFilter: string;
  cityFilter: string;
  searchText: string;
  items: PlannedCustomer[];
  createdAt: string;
  updatedAt: string;
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  settings: Settings;
  customers: Customer[];
  products: Product[];
  orders: Order[];
  dayPlans?: DayPlan[];
};

type ArchiveGroup = {
  month: string;
  days: {
    date: string;
    orders: Order[];
  }[];
};

const emptySettings: Settings = {
  employeeName: "",
  employeeEmail: "",
  defaultRecipient: "",
  ccRecipient: "",
  areaCode: "",
};

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

const emptyDayPlan = (): DayPlan => ({
  id: `dayplan-${Date.now()}`,
  date: today(),
  zipFilter: "",
  cityFilter: "",
  searchText: "",
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
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
      if (!db.objectStoreNames.contains("dayPlans")) db.createObjectStore("dayPlans", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName: string, value: unknown) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
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
    tx.oncomplete = () => db.close();
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function dbDelete(storeName: string, key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function deleteWholeDb() {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Datenbank ist noch geöffnet."));
  });
}

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

function lineTotal(line: Line) {
  return normalizeNumber(line.quantity) * normalizeNumber(line.unitPrice);
}

function orderTotal(order: Order) {
  return order.lines.filter(lineFilled).reduce((sum, line) => sum + lineTotal(line), 0);
}

function ensureRows(lines: Line[]) {
  const filled = lines.filter(lineFilled).length;
  const required = Math.max(DEFAULT_ROWS, Math.ceil(Math.max(filled, 1) / DEFAULT_ROWS) * DEFAULT_ROWS);
  const next = [...lines];
  for (let i = lines.length; i < required; i += 1) next.push(emptyLine(i + 1));
  return next.map((line, idx) => ({ ...line, position: idx + 1 }));
}

function orderHasContent(order: Order) {
  return Boolean(order.company || order.customerNo || order.dailyComment || order.notes || order.lines.some(lineFilled));
}

function reportCode(order: Order) {
  if (order.isPhonePost) return "T/P";
  if (order.isFirstOrder) return "N";
  return "W";
}

function customerIdentity(item: Pick<Order, "customerId" | "customerNo" | "company" | "street" | "city"> | Pick<Customer, "id" | "customerNo" | "company" | "street" | "city">) {
  const idValue = "customerId" in item ? item.customerId : item.id;
  if (idValue) return `id:${idValue}`;
  if (item.customerNo.trim()) return `no:${item.customerNo.trim()}`;
  return `addr:${[item.company, item.street, item.city].map((v) => v.trim().toLowerCase()).join("|")}`;
}

function lineIdentity(line: Line) {
  return `${line.articleNo.trim().toLowerCase()}||${line.description.trim().toLowerCase()}`;
}

function findExistingCustomer(order: Order, customers: Customer[]) {
  if (order.customerId) return customers.find((c) => c.id === order.customerId) || null;
  if (order.customerNo.trim()) return customers.find((c) => c.customerNo.trim() === order.customerNo.trim()) || null;
  const key = [order.company, order.street, order.city].map((v) => v.trim().toLowerCase()).join("|");
  return customers.find((c) => [c.company, c.street, c.city].map((v) => v.trim().toLowerCase()).join("|") === key) || null;
}

function orderBelongsToCustomer(order: Order, customer: Customer) {
  return customerIdentity(order) === customerIdentity(customer);
}

function analyzeHistory(orders: Order[]) {
  const sorted = [...orders].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

  const seenProductsByCustomer = new Map<string, Set<string>>();
  const result = new Map<string, HistoryInfo>();

  sorted.forEach((order) => {
    const customerId = customerIdentity(order);
    const seen = seenProductsByCustomer.get(customerId) || new Set<string>();
    seenProductsByCustomer.set(customerId, seen);

    const firstProducts: string[] = [];
    const repeatProducts: string[] = [];
    let hasAnySale = false;

    order.lines.filter(lineFilled).forEach((line) => {
      const key = lineIdentity(line);
      if (!key || key === "||") return;
      const label = line.description || line.articleNo;
      const hasSale = normalizeNumber(line.quantity) > 0 || normalizeNumber(line.unitPrice) > 0;
      if (hasSale) hasAnySale = true;

      if (seen.has(key)) repeatProducts.push(label);
      else {
        firstProducts.push(label);
        seen.add(key);
      }
    });

    let displayType = "Verkauf";
    if (order.orderType === "lieferschein") displayType = "Lieferschein";
    else if (!hasAnySale && firstProducts.length > 0 && repeatProducts.length === 0) displayType = "Demo";

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

function buildReportRows(orders: Order[]): ReportRow[] {
  const history = analyzeHistory(orders);
  return orders.map((order, index) => {
    const info = history.get(order.id) || {
      firstProducts: [],
      repeatProducts: [],
      hasDemo: false,
      hasAnySale: false,
      displayType: "Verkauf",
    };
    const hasLines = order.lines.some(lineFilled);

    return {
      id: order.id,
      no: index + 1,
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

function summarizeCustomerProducts(customerOrders: Order[]): ProductSummary[] {
  const seen = new Set<string>();
  const map = new Map<string, ProductSummary>();

  [...customerOrders]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((order) => {
      order.lines.filter(lineFilled).forEach((line) => {
        const key = lineIdentity(line);
        if (!key || key === "||") return;

        const entry = map.get(key) || {
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
          entry.quantity += normalizeNumber(line.quantity);
          entry.amount += lineTotal(line);
          entry.orders += 1;
        }

        if (!seen.has(key)) {
          entry.demos += 1;
          seen.add(key);
        }

        map.set(key, entry);
      });
    });

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description));
}

function buildArchive(orders: Order[]): ArchiveGroup[] {
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
        .map(([date, monthOrders]) => ({
          date,
          orders: [...monthOrders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
        })),
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
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (value) {
      const img = new Image();
      img.onload = () => {
        if (!canvasRef.current) return;
        const target = canvasRef.current.getContext("2d");
        if (!target) return;
        target.fillStyle = "#fff";
        target.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        target.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
      };
      img.src = value;
    }
  }, [value]);

  const getPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const source = "touches" in e ? e.touches[0] : e;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  };

  const start = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const finish = () => {
    drawing.current = false;
    if (!canvasRef.current) return;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="signature-box">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={finish}
        onMouseLeave={finish}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={finish}
      />
      <button type="button" className="btn secondary" onClick={() => onChange("")}>
        Unterschrift löschen
      </button>
    </div>
  );
}

export default function App() {
  const importRef = useRef<HTMLInputElement | null>(null);
  const customerSearchWrapRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<"auftrag" | "tagesbericht" | "tagesplanung" | "kunden" | "artikel" | "archiv">("auftrag");
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState("Bereit");
  const [order, setOrder] = useState<Order>(emptyOrder("", ""));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [generatedPdfs, setGeneratedPdfs] = useState<GeneratedPdf[]>([]);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan>(emptyDayPlan());
  const [selectedPlanningCustomers, setSelectedPlanningCustomers] = useState<string[]>([]);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchArticle, setSearchArticle] = useState("");
  const [searchArchive, setSearchArchive] = useState("");
  const [archiveTypeFilter, setArchiveTypeFilter] = useState<"alle" | "auftrag" | "lieferschein" | "demo">("alle");
  const [customerLookup, setCustomerLookup] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [articleSuggestionIndex, setArticleSuggestionIndex] = useState<number | null>(null);
  const [openArchiveMonths, setOpenArchiveMonths] = useState<Record<string, boolean>>({});
  const [openArchiveDays, setOpenArchiveDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!hasIndexedDb()) {
      setStatus("IndexedDB fehlt in dieser Umgebung");
      return;
    }

    (async () => {
      const savedSettings = await dbGet<Settings & { id: string }>("settings", "profile");
      const loadedCustomers = await dbGetAll<Customer>("customers");
      const loadedProducts = await dbGetAll<Product>("products");
      const loadedOrders = await dbGetAll<Order>("orders");
      const loadedDayPlans = await dbGetAll<DayPlan>("dayPlans");

      setCustomers(loadedCustomers);
      setProducts(loadedProducts);
      setOrders(loadedOrders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
      const sortedDayPlans = loadedDayPlans.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      setDayPlans(sortedDayPlans);
      if (sortedDayPlans.length) setDayPlan(sortedDayPlans[0]);

      if (savedSettings) {
        const nextSettings = {
          employeeName: savedSettings.employeeName || "",
          employeeEmail: savedSettings.employeeEmail || "",
          defaultRecipient: savedSettings.defaultRecipient || "",
          ccRecipient: savedSettings.ccRecipient || "",
          areaCode: savedSettings.areaCode || "",
        };
        setSettings(nextSettings);
        setOrder(emptyOrder(nextSettings.employeeName, nextSettings.areaCode));
      } else {
        setSettingsOpen(true);
      }
    })().catch((e) => setStatus(`Fehler beim Laden: ${e.message}`));
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (customerSearchWrapRef.current && !customerSearchWrapRef.current.contains(target)) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const liveOrders = useMemo(() => {
    const monthOrders = orders
      .filter((entry) => entry.date.startsWith(currentMonth()))
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });

    const isSaved = !order.id.startsWith("draft-") && orders.some((saved) => saved.id === order.id);
    const shouldShowLive = order.date.startsWith(currentMonth()) && orderHasContent(order);

    if (isSaved || !shouldShowLive) return monthOrders;
    return [...monthOrders, { ...order, total: orderTotal(order) }];
  }, [orders, order]);

  const monthRows = useMemo(() => buildReportRows(liveOrders), [liveOrders]);
  const todayRows = useMemo(() => monthRows.filter((row) => row.date === today()), [monthRows]);
  const todayTotals = useMemo(() => aggregateRows(todayRows), [todayRows]);
  const monthTotals = useMemo(() => aggregateRows(monthRows), [monthRows]);
  const currentTotal = useMemo(() => orderTotal(order), [order]);
  const historyMap = useMemo(() => analyzeHistory(orders), [orders]);

  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) =>
        [c.customerNo, c.company, c.city, c.contactPerson, c.contactPhone, c.notes].join(" ").toLowerCase().includes(searchCustomer.toLowerCase()),
      ),
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
      const textOk =
        !needle ||
        [saved.customerNo, saved.company, saved.city, saved.contactPerson, saved.date, saved.customerOrderNo]
          .join(" ")
          .toLowerCase()
          .includes(needle);

      const displayType = (historyMap.get(saved.id)?.displayType || "Verkauf").toLowerCase();
      const typeOk = archiveTypeFilter === "alle" || (archiveTypeFilter === "auftrag" ? displayType === "verkauf" : displayType === archiveTypeFilter);
      return textOk && typeOk;
    });
  }, [orders, searchArchive, archiveTypeFilter, historyMap]);

  const archive = useMemo(() => buildArchive(filteredArchiveOrders), [filteredArchiveOrders]);

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter((entry) => orderBelongsToCustomer(entry, selectedCustomer)).sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, selectedCustomer]);

  const selectedCustomerProducts = useMemo(() => summarizeCustomerProducts(selectedCustomerOrders), [selectedCustomerOrders]);
  const selectedCustomerHistory = useMemo(() => analyzeHistory(selectedCustomerOrders), [selectedCustomerOrders]);
  const selectedCustomerTotals = useMemo(
    () => ({
      orders: selectedCustomerOrders.length,
      amount: selectedCustomerOrders.reduce((sum, item) => sum + (item.total || orderTotal(item)), 0),
    }),
    [selectedCustomerOrders],
  );

  const planningSearchResults = useMemo(() => {
    const hasSearch =
      dayPlan.zipFilter.trim() || dayPlan.cityFilter.trim() || dayPlan.searchText.trim();

    if (!hasSearch) return [];

    return customers.filter((c) => {
      const zipOk = !dayPlan.zipFilter.trim() || c.zip.toLowerCase().includes(dayPlan.zipFilter.trim().toLowerCase());
      const cityOk = !dayPlan.cityFilter.trim() || c.city.toLowerCase().includes(dayPlan.cityFilter.trim().toLowerCase());
      const haystack = [c.customerNo, c.company, c.city, c.street, c.contactPerson, c.contactPhone].join(" ").toLowerCase();
      const textOk = !dayPlan.searchText.trim() || haystack.includes(dayPlan.searchText.trim().toLowerCase());
      return zipOk && cityOk && textOk;
    });
  }, [customers, dayPlan.zipFilter, dayPlan.cityFilter, dayPlan.searchText]);

  const sortedPlannedItems = useMemo(
    () => [...dayPlan.items].sort((a, b) => a.sortOrder - b.sortOrder),
    [dayPlan.items],
  );

  const planningCustomerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const dashboardTopCustomers = useMemo(() => {
    const map = new Map<string, { label: string; amount: number }>();
    liveOrders.forEach((entry) => {
      const key = entry.customerId || entry.customerNo || `${entry.company}|${entry.city}`;
      const item = map.get(key) || { label: entry.company || entry.customerNo || "Ohne Kunde", amount: 0 };
      item.amount += entry.total || orderTotal(entry);
      map.set(key, item);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [liveOrders]);

  const dashboardTopProducts = useMemo(() => {
    const map = new Map<string, { label: string; quantity: number }>();
    liveOrders.forEach((entry) => {
      entry.lines.filter(lineFilled).forEach((line) => {
        const key = line.articleNo || line.description;
        const item = map.get(key) || { label: line.description || line.articleNo || "Ohne Artikel", quantity: 0 };
        item.quantity += normalizeNumber(line.quantity);
        map.set(key, item);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [liveOrders]);

  const updateOrder = <K extends keyof Order>(field: K, value: Order[K]) => {
    setOrder((prev) => ({ ...prev, [field]: value }));
  };

  const updateLine = (index: number, field: keyof Line, value: string) => {
    setOrder((prev) => {
      const next = prev.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line));
      if (field === "articleNo") {
        const found = products.find((p) => p.articleNo.trim().toLowerCase() === value.trim().toLowerCase());
        if (found) {
          next[index] = {
            ...next[index],
            description: next[index].description || found.description,
            unitPrice: next[index].unitPrice || String(found.unitPrice),
          };
        }
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
          i === index
            ? { ...line, articleNo: product.articleNo, description: product.description, unitPrice: String(product.unitPrice) }
            : line,
        ),
      ),
    }));
    setArticleSuggestionIndex(null);
  };

  const saveSettings = async () => {
    await dbPut("settings", { id: "profile", ...settings });
    setOrder((prev) => ({
      ...prev,
      employee: settings.employeeName || prev.employee,
      area: settings.areaCode || prev.area,
    }));
    setStatus("Einrichtung gespeichert");
    setSettingsOpen(false);
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

  const validateForSave = (current: Order) => {
    if (!current.company.trim()) return "Firma fehlt";
    if (!current.date.trim()) return "Datum fehlt";
    if (!current.lines.some(lineFilled) && !current.dailyComment.trim()) return "Mindestens eine Position oder Kommentar ist nötig";
    return null;
  };

  const validateForSend = (current: Order) => {
    const error = validateForSave(current);
    if (error) return error;
    if (!current.signatureName.trim() && !current.signatureDataUrl) return "Unterschrift oder Klarschrift fehlt";
    return null;
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
    const nextCustomers = await dbGetAll<Customer>("customers");
    setCustomers(nextCustomers);
    setOrder((prev) => ({ ...prev, customerId: payload.id, customerNo: payload.customerNo }));
    return payload;
  };

  const learnProductsFromOrder = async () => {
    const learned = order.lines
      .filter((line) => line.articleNo.trim() && (line.description.trim() || line.unitPrice.trim()))
      .map((line) => ({
        articleNo: line.articleNo.trim(),
        description: line.description.trim(),
        unitPrice: normalizeNumber(line.unitPrice),
        updatedAt: new Date().toISOString(),
      } satisfies Product));

    for (const item of learned) await dbPut("products", item);
    setProducts(await dbGetAll<Product>("products"));
  };

  const saveCurrentOrder = async () => {
    const error = validateForSave(order);
    if (error) {
      setStatus(error);
      return;
    }

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
    const importedDayPlans = (await dbGetAll<DayPlan>("dayPlans")).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    setDayPlans(importedDayPlans);
    if (importedDayPlans.length) setDayPlan(importedDayPlans[0]);
    setOrder(payload);
    setStatus("Auftrag gespeichert");
  };

  const deleteOrder = async (orderId: string) => {
    await dbDelete("orders", orderId);
    setOrders((await dbGetAll<Order>("orders")).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    const importedDayPlans = (await dbGetAll<DayPlan>("dayPlans")).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    setDayPlans(importedDayPlans);
    if (importedDayPlans.length) setDayPlan(importedDayPlans[0]);
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
    const response = await fetch(item.url);
    const blob = await response.blob();
    const file = new File([blob], item.name, { type: "application/pdf" });

    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: item.name });
      setStatus(`${item.name} im Teilen-Dialog geöffnet`);
      return;
    }

    downloadGeneratedPdf(item);
    setStatus(`${item.name} heruntergeladen`);
  };

  const registerGeneratedPdf = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setGeneratedPdfs((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [{ id: `${Date.now()}-${Math.random()}`, name, url, createdAt: new Date().toISOString() }];
    });
    return url;
  };

  const exportCurrentOrder = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("p", "mm", "a4");
    const lines = ensureRows(order.lines).slice(0, 14);

    const firstChecked = order.isFirstOrder || (!order.isFollowUp && !order.isPhonePost);
    const followChecked = order.isFollowUp;

    const drawLineField = (
      label: string,
      value: string,
      x: number,
      y: number,
      labelWidth: number,
      lineWidth: number,
      maxChars = 40,
    ) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.3);
      doc.text(label, x, y);
      doc.line(x + labelWidth, y + 0.2, x + labelWidth + lineWidth, y + 0.2);
      if (value) doc.text(String(value).slice(0, maxChars), x + labelWidth + 1.4, y - 0.8);
    };

    const drawCheckbox = (checked: boolean, label: string, x: number, y: number) => {
      doc.rect(x, y - 3.5, 3.5, 3.5);
      if (checked) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text("X", x + 0.9, y - 0.6);
      }
      if (label) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(label, x + 5.3, y);
      }
    };

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Auftraggeber:", 12, 14);
    doc.setFontSize(8.5);
    doc.text("Pflichtdaten", 12, 19);

    drawLineField("Firma:", order.company || "", 12, 24, 16, 86, 42);
    drawLineField("Straße:", order.street || "", 12, 39, 18, 84, 42);
    drawLineField("PLZ:", order.zip || "", 12, 54, 14, 22, 10);
    drawLineField("Ort:", order.city || "", 48, 54, 10, 52, 26);
    drawLineField("Telefon:", order.phone || "", 12, 69, 22, 34, 18);
    drawLineField("Fax:", order.fax || "", 72, 69, 12, 36, 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Pflichtdaten", 12, 76);
    drawCheckbox(firstChecked, "Erstauftrag", 12, 82);
    drawCheckbox(followChecked, "Folgeauftrag", 40, 82);
    drawLineField("Datum:", order.date || "", 72, 82, 16, 38, 18);

    drawCheckbox(order.orderType === "auftrag", "", 12, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Auftrag", 18, 90.5);
    drawCheckbox(order.orderType === "lieferschein", "", 56, 90);
    doc.text("Lieferschein", 62, 90.5);

    try {
      if (MOST_LOGO) doc.addImage(MOST_LOGO, "SVG", 129, 10, 18, 18);
    } catch {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.3);
    doc.text("Most GmbH & Co Kg.", 150, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    [
      "Waldweg 1",
      "85461 Grünbach",
      "Tel.: 08122/9998360",
      "Fax: 08122/9998366",
      "HRA 111795",
      "info@most-industrieprodukte.de",
      "www.most-industrieprodukte.de",
    ].forEach((line, idx) => doc.text(line, 150, 15.6 + idx * 3.4));

    drawLineField("Mitarbeiter:", order.employee || "", 128, 42.5, 24, 44, 24);
    drawLineField("Kunden Nr.:", order.customerNo || "", 128, 51.5, 24, 44, 20);
    drawLineField("Kundenbestellnr.:", order.customerOrderNo || "", 128, 60.5, 32, 36, 20);
    drawLineField("Kommission:", order.commission || "", 128, 69.5, 23, 45, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.text("Liefertermin", 128, 78.5);
    drawLineField("Wunsch:", order.deliveryAddress || "", 128, 85.5, 20, 48, 24);

    const tableX = 12;
    const tableY = 98;
    const rowH = 8.1;
    const col = [12, 22, 46, 58, 140, 156, 196];
    doc.rect(tableX, tableY, 184, rowH * 15);
    col.slice(1, -1).forEach((x) => doc.line(x, tableY, x, tableY + rowH * 15));
    for (let i = 1; i <= 15; i += 1) doc.line(tableX, tableY + i * rowH, 196, tableY + i * rowH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.3);
    doc.text("Pos.", 14, tableY + 5.5);
    doc.text("Artikel Nr.", 24, tableY + 5.5);
    doc.text("Menge", 47.2, tableY + 5.5);
    doc.text("Warenbezeichnung", 73, tableY + 5.5);
    doc.text("Einzelpreis", 141.5, tableY + 5.5);
    doc.text("Gesamtpreis", 168, tableY + 5.5);

    doc.setFont("helvetica", "normal");
    lines.forEach((line, idx) => {
      const y = tableY + rowH * (idx + 1) + 5.4;
      doc.setFontSize(10);
      doc.text(String(idx + 1), 16.5, y);
      doc.setFontSize(8.3);
      doc.text((line.articleNo || "").slice(0, 10), 24, y);
      doc.text((line.quantity || "").slice(0, 6), 47.5, y);
      doc.text((line.description || "").slice(0, 50), 60, y);
      doc.text(money(normalizeNumber(line.unitPrice)), 141.5, y);
      doc.text(money(lineTotal(line)), 168, y);
    });

    const footerY = tableY + rowH * 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Lieferadresse:", 12, footerY + 4.5);
    doc.rect(12, footerY + 5.5, 66, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.1);
    doc.text(doc.splitTextToSize(order.deliveryAddress || "", 58), 14, footerY + 12);

    doc.rect(78, footerY + 5.5, 78, 22);
    if (order.signatureDataUrl) {
      try {
        doc.addImage(order.signatureDataUrl, "PNG", 95, footerY + 8.5, 42, 10);
      } catch {}
    }
    if (order.signatureName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.text(order.signatureName.slice(0, 34), 82, footerY + 17.5);
    }
    doc.setFontSize(8);
    doc.text("Name/ Unterschrift des Auftraggebers", 117, footerY + 24.5, { align: "center" });

    doc.rect(156, footerY + 5.5, 40, 11);
    doc.rect(156, footerY + 16.5, 40, 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.3);
    doc.text("Summe:", 170, footerY + 11.8, { align: "center" });
    doc.text("Abteilung:", 176, footerY + 22.8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(money(orderTotal(order)), 176, footerY + 15.4, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text("Pflichtdaten:", 12, 279);
    doc.setFont("helvetica", "normal");
    doc.text("Rechnung per E-Mail an:", 31, 279);
    doc.line(69, 279.2, 146, 279.2);
    if (order.emailInvoice) doc.text(order.emailInvoice.slice(0, 42), 71, 278.1);
    doc.setFontSize(7.6);
    doc.text("Alle Preise sind netto Preise ohne Abzug. Zuzüglich gesetzlich geltender Mehrwertsteuer und Fracht. Die gelieferte Ware", 12, 284);
    doc.text("bleibt bis zur vollständigen Bezahlung Eigentum des Lieferanten. Lieferung ab Lager. Zahlungsbedingungen 14 Tage", 12, 287.5);
    doc.text("Netto. Die Lieferungen und Leistungen erfolgen ausschließlich auf Grundlage unserer AGB, welche auf der Rückseite", 12, 291);
    doc.text("abgedruckt sind.", 12, 294.5);

    const blob = doc.output("blob");
    const name = `Most_Auftrag_${order.customerNo || "ohne-kunde"}_${order.date}.pdf`;
    const url = registerGeneratedPdf(name, blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setStatus("Einzel-PDF erzeugt");
  };

  const exportDailyReport = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("p", "mm", "a4");
    const rows = todayRows.slice(0, 10);

    const summarizeByCode = (items: ReportRow[]) => {
      const base = {
        fax: { visits: 0, demos: 0, sales: 0, amount: 0 },
        n: { visits: 0, demos: 0, sales: 0, amount: 0 },
        w: { visits: 0, demos: 0, sales: 0, amount: 0 },
      };
      items.forEach((row) => {
        const key = row.code === "T/P" ? "fax" : row.code === "N" ? "n" : "w";
        base[key].visits += row.visits;
        base[key].demos += row.demos;
        base[key].sales += row.sales;
        base[key].amount += row.amount;
      });
      return base;
    };

    const drawCell = (value: string, x: number, y: number, width: number, lineHeight = 3.8, maxLines = 3, align: "left" | "center" = "left") => {
      const lines = doc.splitTextToSize(value || "", width).slice(0, maxLines);
      lines.forEach((line: string, idx: number) => {
        doc.text(line, align === "center" ? x + width / 2 : x, y + idx * lineHeight, align === "center" ? { align: "center" } : undefined);
      });
    };

    const dayCode = summarizeByCode(todayRows);
    const monthCode = summarizeByCode(monthRows);

    doc.setDrawColor(0);
    doc.setLineWidth(0.35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("TAGESBERICHT", 12, 18);
    doc.setFontSize(10);
    doc.text("für Firma: Most GmbH & Co.KG", 12, 27);

    doc.circle(74, 16, 7.5);
    doc.setFontSize(16);
    doc.text(String(rows.length || 0), 74, 18, { align: "center" });

    doc.rect(120, 8, 70, 24);
    [14, 20, 26].forEach((y) => doc.line(120, y, 190, y));
    doc.line(146, 8, 146, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("NAME", 122, 12.5);
    doc.text("DATUM", 122, 18.5);
    doc.text("GEBIET", 122, 24.5);
    doc.text("TRAINER", 122, 30.5);
    doc.text((settings.employeeName || order.employee || "").slice(0, 20), 148, 12.5);
    doc.text(today(), 148, 18.5);
    doc.text((settings.areaCode || order.area || "").slice(0, 18), 148, 24.5);
    doc.text((order.trainer || "").slice(0, 18), 148, 30.5);

    const col = [12, 24, 38, 102, 130, 158, 177, 190];
    const top = 35;
    const bodyBottom = 240;
    doc.rect(12, top, 178, bodyBottom - top);
    col.slice(1, -1).forEach((v) => doc.line(v, top, v, bodyBottom));
    doc.line(12, 46, 190, 46);
    doc.line(102, 40.5, 177, 40.5);
    doc.line(130, 46, 130, bodyBottom);
    doc.line(158, 46, 158, bodyBottom);

    doc.setFontSize(7.2);
    doc.text("Fax/W/N", 24.7, 39.5);
    doc.text("Uhrzeit", 25.2, 43.6);
    doc.text("NAME UND ADRESSE", 63, 41.5);
    doc.text("PRODUKT", 129.5, 39.5, { align: "center" });
    doc.text("Nachbestellung", 109, 44.2);
    doc.text("Erstbestellung", 136.2, 44.2);
    doc.text("Summe", 167.2, 41.4, { align: "center" });
    doc.text("Kommentar", 183.5, 41.3, { align: "center" });
    doc.text("Cod.", 183.5, 44.4, { align: "center" });

    const rowTop = 46;
    const rowH = 19.4;
    for (let i = 0; i <= 10; i += 1) {
      doc.line(12, rowTop + i * rowH, 190, rowTop + i * rowH);
      if (i < 10) {
        const innerTop = rowTop + i * rowH;
        doc.line(38, innerTop + 6.4, 102, innerTop + 6.4);
        doc.line(38, innerTop + 12.8, 102, innerTop + 12.8);
        doc.line(102, innerTop + 12.8, 130, innerTop + 12.8);
      }
    }

    rows.forEach((row, idx) => {
      const ry = rowTop + idx * rowH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`${idx + 1},`, 18, ry + 10.7, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      drawCell(row.code, 24.5, ry + 8.2, 12.5, 3.5, 2, "center");

      const parts = row.nameAddress.split("\n");
      drawCell(parts[0] || "", 39, ry + 4.5, 61, 3.9, 1);
      drawCell(parts[1] || "", 39, ry + 10.5, 61, 3.9, 1);
      drawCell(parts[2] || "TEL. NR. ODER PERSON", 39, ry + 16.3, 61, 3.9, 1);

      drawCell(row.productRepeat || "", 103, ry + 4.6, 25, 3.8, 2);
      drawCell(row.productFirst || "", 131, ry + 4.6, 25, 3.8, 2);

      if (row.amount) drawCell(money(row.amount), 159.2, ry + 14.8, 16.3, 3.8, 1, "center");

      const commentText = row.comment || "";
      drawCell(commentText, 178.2, ry + 9.1, 10.5, 3.6, 2, "center");
    });

    const repeatSum = rows.reduce((sum, row) => sum + (row.productRepeat ? row.amount : 0), 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.text("SUMME WIEDERHOLUNGSGESCHÄFTE", 13, 244.5);
    doc.text(money(repeatSum), 102, 244.5);

    const drawSummaryTable = (
      title: string,
      x0: number,
      stats: { fax: { visits: number; demos: number; sales: number; amount: number }; n: { visits: number; demos: number; sales: number; amount: number }; w: { visits: number; demos: number; sales: number; amount: number } },
      totals: { visits: number; demos: number; sales: number; amount: number },
    ) => {
      const y0 = 246;
      const w = 86;
      const rowStep = 9.75;
      doc.rect(x0, y0, w, 46);
      doc.line(x0, y0 + 7, x0 + w, y0 + 7);
      doc.line(x0 + 8, y0, x0 + 8, y0 + 46);
      doc.line(x0 + 19, y0 + 7, x0 + 19, y0 + 46);
      doc.line(x0 + 33, y0 + 7, x0 + 33, y0 + 46);
      doc.line(x0 + 47, y0 + 7, x0 + 47, y0 + 46);
      doc.line(x0 + 62, y0 + 7, x0 + 62, y0 + 46);
      for (let i = 1; i <= 4; i += 1) doc.line(x0, y0 + 7 + i * rowStep, x0 + w, y0 + 7 + i * rowStep);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(title, x0 + w / 2, y0 + 5, { align: "center" });
      doc.text("Art", x0 + 4, y0 + 13.1);
      doc.text("Total", x0 + 26, y0 + 13.1);
      doc.text("Summe", x0 + 74, y0 + 13.1, { align: "center" });
      doc.text("Besuche", x0 + 11.2, y0 + 20.1);
      doc.text("Demos", x0 + 26.5, y0 + 20.1);
      doc.text("Verkäufe", x0 + 40.5, y0 + 20.1);

      const rowsLocal = [
        ["Fax", stats.fax],
        ["N", stats.n],
        ["W", stats.w],
        ["TOT.", totals],
      ] as const;

      rowsLocal.forEach((entry, idx) => {
        const y = y0 + 27 + idx * rowStep;
        doc.text(entry[0], x0 + 2.5, y);
        doc.text(String(entry[1].visits), x0 + 14.2, y, { align: "center" });
        doc.text(String(entry[1].demos), x0 + 28.3, y, { align: "center" });
        doc.text(String(entry[1].sales), x0 + 42.2, y, { align: "center" });
        doc.text(money(entry[1].amount), x0 + 74, y, { align: "center" });
      });
    };

    drawSummaryTable("TAGESERGEBNIS", 12, dayCode, todayTotals);
    drawSummaryTable("MONATSERGEBNIS", 104, monthCode, monthTotals);

    doc.setFontSize(7.2);
    doc.text("Erklärung zu den Zeichen Abkürzungen Fett=DEMO | Unterstrichen = Verkauft", 105, 295);

    const blob = doc.output("blob");
    const name = `Most_Tagesbericht_${today()}.pdf`;
    const url = registerGeneratedPdf(name, blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setStatus("Tagesbericht erzeugt");
  };

  const sendDailyBatch = async () => {
    const error = validateForSend(order);
    if (error) {
      setStatus(error);
      return;
    }
    await exportCurrentOrder();
    await exportDailyReport();
    setStatus("PDFs erzeugt. Bitte über dein Mailprogramm versenden.");
  };


  const togglePlanningCustomerSelection = (customerId: string) => {
    setSelectedPlanningCustomers((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId],
    );
  };

  const addSelectedCustomersToDayPlan = () => {
    if (!selectedPlanningCustomers.length) {
      setStatus("Keine Kunden ausgewählt");
      return;
    }

    setDayPlan((prev) => {
      const existingCustomerIds = new Set(prev.items.map((item) => item.customerId));
      const newItems: PlannedCustomer[] = selectedPlanningCustomers
        .filter((customerId) => !existingCustomerIds.has(customerId))
        .map((customerId, index) => ({
          id: `planned-${Date.now()}-${index}`,
          customerId,
          plannedProducts: "",
          notes: "",
          isDone: false,
          sortOrder: prev.items.length + index,
          addedAt: new Date().toISOString(),
        }));

      return {
        ...prev,
        items: [...prev.items, ...newItems],
        updatedAt: new Date().toISOString(),
      };
    });

    setSelectedPlanningCustomers([]);
    setStatus("Kunden zur Tagesplanung hinzugefügt");
  };

  const updatePlannedCustomer = (plannedId: string, patch: Partial<PlannedCustomer>) => {
    setDayPlan((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === plannedId ? { ...item, ...patch } : item)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const removePlannedCustomer = (plannedId: string) => {
    setDayPlan((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== plannedId),
      updatedAt: new Date().toISOString(),
    }));
    setStatus("Kunde aus Tagesplanung entfernt");
  };

  const movePlannedCustomer = (plannedId: string, direction: "up" | "down") => {
    setDayPlan((prev) => {
      const items = [...prev.items].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = items.findIndex((item) => item.id === plannedId);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return prev;

      [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
      const normalized = items.map((item, idx) => ({ ...item, sortOrder: idx }));

      return {
        ...prev,
        items: normalized,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const saveCurrentDayPlan = async () => {
    const payload: DayPlan = {
      ...dayPlan,
      updatedAt: new Date().toISOString(),
    };
    await dbPut("dayPlans", payload);
    const nextPlans = await dbGetAll<DayPlan>("dayPlans");
    const sorted = nextPlans.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    setDayPlans(sorted);
    setDayPlan(payload);
    setStatus("Tagesplanung gespeichert");
  };

  const loadDayPlan = (plan: DayPlan) => {
    setDayPlan(plan);
    setSelectedPlanningCustomers([]);
    setStatus("Tagesplanung geladen");
  };

  const newDayPlan = () => {
    setDayPlan(emptyDayPlan());
    setSelectedPlanningCustomers([]);
    setStatus("Neue Tagesplanung");
  };

  const deleteDayPlan = async (planId: string) => {
    await dbDelete("dayPlans", planId);
    const nextPlans = await dbGetAll<DayPlan>("dayPlans");
    const sorted = nextPlans.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    setDayPlans(sorted);
    if (dayPlan.id === planId) setDayPlan(emptyDayPlan());
    setStatus("Tagesplanung gelöscht");
  };

  const getPlanningCustomerProducts = (customerId: string) => {
    const customer = planningCustomerMap.get(customerId);
    if (!customer) return [] as string[];
    const customerOrders = orders.filter((savedOrder) => orderBelongsToCustomer(savedOrder, customer));
    return summarizeCustomerProducts(customerOrders)
      .map((product) => product.description || product.articleNo)
      .filter(Boolean);
  };

  const openPlannedCustomerDetails = (plannedCustomer: PlannedCustomer) => {
    const customer = planningCustomerMap.get(plannedCustomer.customerId);
    if (!customer) return;
    setSelectedCustomer(customer);
  };

  const transferPlannedCustomerToOrder = (plannedCustomer: PlannedCustomer) => {
    const customer = planningCustomerMap.get(plannedCustomer.customerId);
    if (!customer) return;

    setOrder((prev) => ({
      ...prev,
      customerId: customer.id,
      customerNo: customer.customerNo || "",
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
      notes: plannedCustomer.notes || customer.notes || prev.notes,
      dailyComment: plannedCustomer.plannedProducts || prev.dailyComment,
    }));
    setTab("auftrag");
    setStatus("Kunde aus Tagesplanung in Auftrag übernommen");
  };


  const exportBackup = () => {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      customers,
      products,
      orders,
      dayPlans,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `most_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Backup exportiert");
  };

  const importBackup = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as BackupPayload;
    await deleteWholeDb();
    await dbPut("settings", { id: "profile", ...parsed.settings });
    for (const customer of parsed.customers) await dbPut("customers", customer);
    for (const product of parsed.products) await dbPut("products", product);
    for (const savedOrder of parsed.orders) await dbPut("orders", { ...savedOrder, lines: ensureRows(savedOrder.lines || []) });
    for (const savedPlan of parsed.dayPlans || []) await dbPut("dayPlans", savedPlan);

    setSettings(parsed.settings);
    setCustomers(await dbGetAll<Customer>("customers"));
    setProducts(await dbGetAll<Product>("products"));
    setOrders((await dbGetAll<Order>("orders")).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    const importedDayPlans = (await dbGetAll<DayPlan>("dayPlans")).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    setDayPlans(importedDayPlans);
    if (importedDayPlans.length) setDayPlan(importedDayPlans[0]);
    setOrder(emptyOrder(parsed.settings.employeeName, parsed.settings.areaCode));
    setStatus("Backup importiert");
  };

  const resetApp = async () => {
    await deleteWholeDb();
    setSettings(emptySettings);
    setCustomers([]);
    setProducts([]);
    setOrders([]);
    setDayPlans([]);
    setGeneratedPdfs((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setOrder(emptyOrder("", ""));
    setSelectedCustomer(null);
    setDayPlan(emptyDayPlan());
    setSelectedPlanningCustomers([]);
    setSettingsOpen(true);
    setStatus("App zurückgesetzt");
  };

  return (
    <div className="app-shell">
      <style>{`
        :root{
          --line:#d9e2ec;
          --muted:#64748b;
          --text:#0f172a;
          --green:#16a34a;
          --green-dark:#15803d;
          --blue:#2563eb;
          --blue-dark:#1d4ed8;
          --shadow:0 14px 34px rgba(15,23,42,.08);
        }
        *{box-sizing:border-box}
        body{
          margin:0;
          font-family:Inter,Arial,sans-serif;
          background:linear-gradient(135deg,#f7fafc 0%,#eff6ff 55%,#ecfdf5 100%);
          color:var(--text)
        }
        h1,h2,h3,p{margin:0}
        .app-shell{min-height:100vh;padding:24px}
        .app-header,.panel,.modal{
          background:rgba(255,255,255,.96);
          border:1px solid rgba(217,226,236,.95);
          border-radius:24px;
          box-shadow:var(--shadow);
          backdrop-filter:blur(10px);
        }
        .app-header{
          max-width:1366px;
          margin:0 auto 18px;
          display:flex;
          justify-content:space-between;
          gap:16px;
          padding:22px 24px;
          align-items:center;
        }
        .brand{display:flex;gap:16px;align-items:center}
        .brand p{margin-top:6px;color:var(--muted)}
        .logo{width:58px;height:58px;border-radius:14px;box-shadow:0 6px 16px rgba(21,92,51,.2)}
        .status-box{font-size:14px;display:grid;gap:6px;color:var(--muted)}
        .status-box strong{color:var(--text)}

        .tabs-row{max-width:1366px;margin:0 auto 18px;display:flex;gap:8px;flex-wrap:wrap}
        .tab{
          padding:12px 18px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.92);cursor:pointer;
          color:var(--text);font-weight:700;transition:.18s ease;
        }
        .tab.active{background:linear-gradient(135deg,var(--green) 0%,var(--green-dark) 100%);color:#fff;border-color:transparent}

        .grid-2{max-width:1366px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.96fr) minmax(160px,.28fr);gap:18px}
        .panel{padding:16px}
        .side-stack{display:grid;gap:12px;align-content:start}
        .compact{display:grid;gap:8px}
        .panel-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
        .small{margin-bottom:12px}
        .button-row{display:flex;gap:8px}
        .wrap{flex-wrap:wrap}

        .btn{
          border:1px solid var(--line);background:#fff;border-radius:14px;padding:10px 14px;cursor:pointer;
          display:inline-flex;align-items:center;gap:6px;font-weight:700;transition:.18s ease
        }
        .btn.primary{background:linear-gradient(135deg,var(--green) 0%,var(--green-dark) 100%);color:#fff;border-color:transparent}
        .btn.primary.blue{background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%);border-color:transparent;color:#fff}
        .btn.secondary{background:#fff}
        .btn.danger{background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:#fff;border-color:transparent}
        .btn.setup{background:linear-gradient(135deg,var(--green) 0%,var(--green-dark) 100%);color:#fff;border-color:transparent;padding:7px 10px;justify-content:center;font-size:13px}
        .btn:hover{transform:translateY(-1px)}

        .form-grid{display:grid;gap:12px}
        .form-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}
        .form-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
        label span{display:block;font-size:13px;margin-bottom:1px;color:var(--muted);font-weight:700;line-height:1.05}
        input,select,textarea{
          width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:14px;font:inherit;background:#fff;
          transition:border-color .18s ease, box-shadow .18s ease;
        }
        input:focus,select:focus,textarea:focus{outline:none;border-color:#93c5fd;box-shadow:0 0 0 4px rgba(37,99,235,.12)}
        input[type="checkbox"]{width:auto;padding:0;box-shadow:none;border-radius:4px}

        .checks{display:flex;gap:28px;flex-wrap:wrap;align-items:center;background:linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid var(--line);border-radius:18px;padding:12px 18px;margin:18px 0}.checks label{display:inline-flex;align-items:center;gap:8px;font-weight:700;white-space:nowrap;line-height:1.1}

        .box{border:1px solid var(--line);border-radius:18px;padding:14px;background:linear-gradient(180deg,#fff 0%,#fbfdff 100%)}
        .field-group{
          margin-top:12px;border:1px solid var(--line);border-radius:16px;padding:12px 14px;background:#f8fafc
        }
        .field-group-title{
          font-size:12px;font-weight:800;letter-spacing:.04em;color:#475569;text-transform:uppercase;margin-bottom:10px
        }

        .customer-form-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.72fr);gap:14px;align-items:start}
        .customer-form-grid > .box{height:auto;min-height:0}
        .signature-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.62fr);gap:14px;align-items:start}

        .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff}
        .table-wrap.tall{max-height:560px}
        .table-wrap.small{max-height:240px}
        .data-table{width:100%;border-collapse:collapse}
        .data-table th,.data-table td{padding:11px 12px;border-bottom:1px solid #edf2f7;text-align:left;vertical-align:top}
        .data-table th{background:#f8fafc;color:#334155;font-size:13px;position:sticky;top:0;z-index:1}
        .data-table tr:hover td{background:#fafcff}

        .summary-line,.row-between{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .summary-line{margin-top:14px}

        .suggest-wrap{position:relative}
        .suggestions{
          position:absolute;left:0;top:calc(100% + 6px);z-index:25;background:#fff;border:1px solid var(--line);
          border-radius:14px;padding:6px;width:340px;max-height:220px;overflow:auto;box-shadow:0 18px 34px rgba(15,23,42,.12)
        }
        .suggestions button,.dropdown-item{
          display:flex;flex-direction:column;align-items:flex-start;width:100%;border:0;background:#fff;padding:9px 10px;border-radius:10px;cursor:pointer
        }
        .suggestions button span,.dropdown-item span{color:var(--muted);font-size:13px}
        .suggestions button:hover,.dropdown-item:hover{background:#f8fafc}
        .dropdown-anchor{position:relative}
        .dropdown-list{
          position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:30;
          border:1px solid var(--line);border-radius:14px;max-height:240px;overflow:auto;background:#fff;
          box-shadow:0 18px 34px rgba(15,23,42,.12)
        }

        
        .col-action{width:48px}
        .col-pos{width:56px}
        .col-article{width:96px}
        .col-qty{width:78px}
        .col-desc{min-width:420px}
        .col-price{width:96px}
        .col-total{width:130px}
        .line-article-input{max-width:72px}
        .line-qty-input{max-width:58px}
        .line-price-input{max-width:74px}
        .line-desc-input{min-width:360px}

        .icon-btn{border:1px solid var(--line);background:#fff;border-radius:12px;padding:6px 8px;cursor:pointer}

        .metric{background:linear-gradient(180deg,#f8fafc 0%,#eff6ff 100%);border-radius:12px;padding:7px 9px;display:grid;gap:2px;min-height:unset}
        .metric span{color:var(--muted);font-size:11px}
        .metric strong{font-size:15px;line-height:1.02}

        .pdf-card{border:1px solid var(--line);border-radius:14px;padding:8px 10px;display:grid;gap:6px;background:#fff;font-size:13px}
        .sublist{display:grid;gap:8px}
        .empty-state{padding:14px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);background:#f8fafc}
        .search{min-width:240px}
        .stack{display:grid;gap:16px}
        .archive-group{border:1px solid var(--line);border-radius:18px;background:#fff}
        .archive-head{
          width:100%;display:flex;justify-content:space-between;align-items:center;padding:16px;border:0;
          background:linear-gradient(180deg,#f8fafc 0%,#eff6ff 100%);border-radius:18px;cursor:pointer
        }
        .archive-head span{color:var(--muted)}
        .archive-day{display:grid;gap:10px;padding:12px 16px}
        .archive-day-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:#f8fafc;cursor:pointer}
        .archive-day-label{font-weight:700}
        .archive-day-meta{font-size:12px;color:var(--muted)}
        .archive-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .archive-card{border:1px solid var(--line);border-radius:18px;padding:16px;display:grid;gap:8px;background:#fff}
        .archive-card span{color:var(--muted)}

        .preline{white-space:pre-line}
        .clickable{cursor:pointer}
        .clickable:hover td{background:#f8fbff}
        .pill{padding:8px 12px;background:#f8fafc;border:1px solid var(--line);border-radius:999px;font-size:13px;color:#334155}

        .stats-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px;align-items:stretch}.report-bottom{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:stretch}.report-bottom>.box{height:100%;display:flex;flex-direction:column}
        .stat-card{border:1px solid var(--line);border-radius:16px;padding:12px;background:#fff}
        .stat-card span{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}
        .stat-card strong{font-size:22px}
        .totals-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.customer-modal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.customer-right-sections{display:grid;grid-template-rows:minmax(220px,1fr) minmax(220px,1fr);gap:16px;align-items:stretch}

        .modal-backdrop{
          position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px;z-index:50
        }
        .modal{width:min(760px,100%);max-height:90vh;overflow:auto;padding:22px}
        .modal.large{width:min(1220px,100%)}
        .info-list{display:grid;gap:8px}
        .form-sections{align-items:start}.customer-form-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.62fr);gap:16px}.signature-box{display:grid;gap:8px}
        .signature-canvas{width:100%;height:140px;border:1px solid var(--line);border-radius:14px;background:#fff}

        @media (max-width: 1100px){
          .grid-2{grid-template-columns:1fr}
          .archive-cards,.form-grid.four,.form-grid.two,.stats-grid,.totals-grid{grid-template-columns:1fr}
          .app-header{flex-direction:column;align-items:flex-start}
        }
      `}</style>

      <header className="app-header">
        <div className="brand">
          <img src={MOST_LOGO} alt="Most Logo" className="logo" />
          <div>
            <h1>Most Außendienst App</h1>
            <p>Offline • Aufträge • Tagesbericht • Kunden • Archiv • Backup • PDF</p>
          </div>
        </div>
        <div className="status-box">
          <div>Status: <strong>{status}</strong></div>
          <div>Heute: <strong>{liveOrders.filter((o) => o.date === today()).length} Aufträge</strong></div>
        </div>
      </header>

      <nav className="tabs-row">
        {(["auftrag", "tagesbericht", "tagesplanung", "kunden", "artikel", "archiv"] as const).map((item) => (
          <button key={item} className={tab === item ? "tab active" : "tab"} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      {tab === "auftrag" && (
        <div className="grid-2">
          <section className="panel">
            <div className="panel-head">
              <h2>Auftragsformular</h2>
              <div className="button-row wrap">
                <button className="btn secondary" onClick={() => setOrder(emptyOrder(settings.employeeName, settings.areaCode))}>Neu</button>
                <button className="btn primary blue" onClick={saveCurrentOrder}>Speichern</button>
                <button className="btn secondary" onClick={exportCurrentOrder}>PDF</button>
                <button className="btn primary" onClick={sendDailyBatch}>Tagesversand</button>
              </div>
            </div>

            <div className="form-grid four">
              <label><span>Datum</span><input type="date" value={order.date} onChange={(e) => updateOrder("date", e.target.value)} /></label>
              <label><span>Mitarbeiter</span><input value={order.employee} onChange={(e) => updateOrder("employee", e.target.value)} /></label>
              <label><span>Gebiet</span><input value={order.area} onChange={(e) => updateOrder("area", e.target.value)} /></label>
              <label><span>Typ</span><select value={order.orderType} onChange={(e) => updateOrder("orderType", e.target.value as "auftrag" | "lieferschein")}><option value="auftrag">Auftrag</option><option value="lieferschein">Lieferschein</option></select></label>
            </div>

            <div className="checks">
              <label><input type="checkbox" checked={order.isFirstOrder} onChange={(e) => updateOrder("isFirstOrder", e.target.checked)} /> Neukunde</label>
              <label><input type="checkbox" checked={order.isFollowUp} onChange={(e) => updateOrder("isFollowUp", e.target.checked)} /> Wiederholungskunde</label>
              <label><input type="checkbox" checked={order.isPhonePost} onChange={(e) => updateOrder("isPhonePost", e.target.checked)} /> Telefon / Post</label>
            </div>

            <div className="customer-form-grid">
              <div className="box">
                <div className="panel-head small" style={{ marginBottom: 8 }}>
                  <h3>Kunde</h3>
                  <button className="btn secondary" onClick={saveCustomerFromOrder}>Kunde speichern</button>
                </div>

                <div ref={customerSearchWrapRef} className="dropdown-anchor">
                  <label><span>Kunde suchen</span><input value={customerLookup} onChange={(e) => { setCustomerLookup(e.target.value); setCustomerDropdownOpen(true); }} onFocus={() => setCustomerDropdownOpen(true)} placeholder="Name, Ort oder Straße" /></label>
                  {customerDropdownOpen && customerLookupResults.length > 0 && (
                    <div className="dropdown-list">
                      {customerLookupResults.map((c) => (
                        <button key={c.id} className="dropdown-item" onClick={() => applyCustomer(c)}>
                          <strong>{c.company || "Ohne Firma"}</strong>
                          <span>{[c.customerNo || "-", c.city, c.street, c.contactPerson].filter(Boolean).join(" • ")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="field-group">
                  <div className="field-group-title">Nummern</div>
                  <div className="form-grid two">
                    <label><span>Kundennummer</span><input value={order.customerNo} onChange={(e) => updateOrder("customerNo", e.target.value)} /></label>
                    <label><span>Kundenbestellnr.</span><input value={order.customerOrderNo} onChange={(e) => updateOrder("customerOrderNo", e.target.value)} /></label>
                  </div>
                </div>

                <label><span>Firma</span><input value={order.company} onChange={(e) => updateOrder("company", e.target.value)} /></label>
                <label><span>Straße</span><input value={order.street} onChange={(e) => updateOrder("street", e.target.value)} /></label>
                <div className="form-grid two">
                  <label><span>PLZ</span><input value={order.zip} onChange={(e) => updateOrder("zip", e.target.value)} /></label>
                  <label><span>Ort</span><input value={order.city} onChange={(e) => updateOrder("city", e.target.value)} /></label>
                </div>
                <div className="form-grid two">
                  <label><span>Telefon</span><input value={order.phone} onChange={(e) => updateOrder("phone", e.target.value)} /></label>
                  <label><span>Fax</span><input value={order.fax} onChange={(e) => updateOrder("fax", e.target.value)} /></label>
                </div>
              </div>

              <div className="box">
                <h3>Zusatz</h3>
                <label><span>Kommission</span><input value={order.commission} onChange={(e) => updateOrder("commission", e.target.value)} /></label>
                <label><span>E-Mail Empfänger</span><input value={order.emailInvoice} onChange={(e) => updateOrder("emailInvoice", e.target.value)} /></label>
                <label><span>Ansprechpartner</span><input value={order.contactPerson} onChange={(e) => updateOrder("contactPerson", e.target.value)} /></label>
                <label><span>Ansprechpartner Telefon</span><input value={order.contactPhone} onChange={(e) => updateOrder("contactPhone", e.target.value)} /></label>
                <label><span>Trainer</span><input value={order.trainer} onChange={(e) => updateOrder("trainer", e.target.value)} /></label>
                <label><span>Lieferadresse</span><textarea rows={3} value={order.deliveryAddress} onChange={(e) => updateOrder("deliveryAddress", e.target.value)} /></label>
                <label><span>Vermerke</span><textarea rows={3} value={order.notes} onChange={(e) => updateOrder("notes", e.target.value)} /></label>
                <label><span>Tagesbericht Kommentar</span><textarea rows={3} value={order.dailyComment} onChange={(e) => updateOrder("dailyComment", e.target.value)} /></label>
              </div>
            </div>

            <div className="box">
              <h3>Artikel</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th className="col-action"></th><th className="col-pos">Pos.</th><th className="col-article">Art.-Nr.</th><th className="col-qty">Menge</th><th className="col-desc">Warenbezeichnung</th><th className="col-price">Einzelpreis</th><th className="col-total">Gesamtpreis</th></tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line, index) => (
                      <tr key={line.id}>
                        <td><button className="icon-btn" onClick={() => setOrder((prev) => ({ ...prev, lines: ensureRows(prev.lines.map((item, i) => (i === index ? emptyLine(i + 1) : item))) }))}>🗑</button></td>
                        <td>{index + 1}</td>
                        <td>
                          <div className="suggest-wrap">
                            <input className="line-article-input" value={line.articleNo} onChange={(e) => updateLine(index, "articleNo", e.target.value)} onFocus={() => setArticleSuggestionIndex(index)} onBlur={() => setTimeout(() => setArticleSuggestionIndex((prev) => (prev === index ? null : prev)), 120)} />
                            {articleSuggestionIndex === index && suggestionsForLine(line).length > 0 && (
                              <div className="suggestions">
                                {suggestionsForLine(line).map((product) => (
                                  <button key={product.articleNo} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion(index, product)}>
                                    <strong>{product.articleNo}</strong>
                                    <span>{product.description} • {money(product.unitPrice)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td><input className="line-qty-input" value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} /></td>
                        <td><input className="line-desc-input" value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} /></td>
                        <td><input className="line-price-input" value={line.unitPrice} onChange={(e) => updateLine(index, "unitPrice", e.target.value)} /></td>
                        <td>{money(lineTotal(line))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="summary-line">
                <span>{Math.ceil(Math.max(order.lines.filter(lineFilled).length, 1) / DEFAULT_ROWS)} PDF-Seiten</span>
                <strong>Summe {money(currentTotal)}</strong>
              </div>
            </div>

            <div className="signature-grid">
              <div className="box">
                <h3>Unterschrift</h3>
                <SignaturePad value={order.signatureDataUrl} onChange={(v) => updateOrder("signatureDataUrl", v)} />
              </div>
              <div className="box">
                <label><span>Klarschrift</span><input value={order.signatureName} onChange={(e) => updateOrder("signatureName", e.target.value)} /></label>
              </div>
            </div>
          </section>

          <aside className="side-stack">
            <section className="panel compact">
              <h3>Heute</h3>
              <div className="metric"><span>Heutige Aufträge</span><strong>{liveOrders.filter((o) => o.date === today()).length}</strong></div>
              <div className="metric"><span>Tagesumsatz</span><strong>{money(todayTotals.amount)}</strong></div>
              <div className="metric"><span>Monatsumsatz</span><strong>{money(monthTotals.amount)}</strong></div>
              <button className="btn setup" onClick={() => setSettingsOpen(true)}>Einrichtung</button>
            </section>

            <section className="panel compact">
              <h3>Erzeugte PDFs</h3>
              {generatedPdfs.length ? generatedPdfs.map((item) => (
                <div key={item.id} className="pdf-card">
                  <strong>{item.name}</strong>
                  <div className="button-row wrap">
                    <button className="btn secondary" onClick={() => window.open(item.url, "_blank")}>Öffnen</button>
                    <button className="btn secondary" onClick={() => downloadGeneratedPdf(item)}>Download</button>
                    <button className="btn secondary" onClick={() => shareGeneratedPdf(item)}>Teilen</button>
                  </div>
                </div>
              )) : <p>Noch keine PDFs erzeugt.</p>}
            </section>

            <section className="panel compact">
              <h3>Kennzahlen</h3>
              <div className="sublist">
                <strong>Top Kunden</strong>
                {dashboardTopCustomers.map((item, idx) => (
                  <div key={idx} className="row-between"><span>{item.label}</span><span>{money(item.amount)}</span></div>
                ))}
              </div>
              <div className="sublist">
                <strong>Top Artikel</strong>
                {dashboardTopProducts.map((item, idx) => (
                  <div key={idx} className="row-between"><span>{item.label}</span><span>{item.quantity}</span></div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === "tagesbericht" && (
        <section className="panel" style={{ maxWidth: 1366, margin: "0 auto" }}>
          <div className="panel-head">
            <h2>Tagesbericht</h2>
            <div className="button-row wrap">
              <span className="pill">Heute {today()}</span>
              <span className="pill">Heute {todayRows.length} Zeilen</span>
              <span className="pill">Monat {currentMonth()}</span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th></th><th>Nr.</th><th>Cod.</th><th>Name und Adresse</th><th>Nachbestellung</th><th>Erstbestellung / Demo</th><th>Summe</th><th>Kommentar</th></tr></thead>
              <tbody>
                {todayRows.map((row) => (
                  <tr key={row.id}>
                    <td><button className="icon-btn" onClick={() => deleteOrder(row.id)}>🗑</button></td>
                    <td>{row.no}</td>
                    <td>{row.code}</td>
                    <td className="preline">{row.nameAddress}</td>
                    <td>{row.productRepeat}</td>
                    <td>{row.productFirst}</td>
                    <td>{money(row.amount)}</td>
                    <td>{row.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-bottom" style={{ maxWidth: "100%" }}>
            <div className="box">
              <h3>Tagesergebnis</h3>
              <div className="stats-grid">
                <div className="stat-card"><span>Besuche</span><strong>{todayTotals.visits}</strong></div>
                <div className="stat-card"><span>Demos</span><strong>{todayTotals.demos}</strong></div>
                <div className="stat-card"><span>Verkäufe</span><strong>{todayTotals.sales}</strong></div>
                <div className="stat-card"><span>Summe</span><strong>{money(todayTotals.amount)}</strong></div>
              </div>
            </div>
            <div className="box">
              <h3>Monatsergebnis</h3>
              <div className="stats-grid">
                <div className="stat-card"><span>Besuche</span><strong>{monthTotals.visits}</strong></div>
                <div className="stat-card"><span>Demos</span><strong>{monthTotals.demos}</strong></div>
                <div className="stat-card"><span>Verkäufe</span><strong>{monthTotals.sales}</strong></div>
                <div className="stat-card"><span>Summe</span><strong>{money(monthTotals.amount)}</strong></div>
              </div>
            </div>
          </div>
        </section>
      )}


      {tab === "tagesplanung" && (
        <section className="panel" style={{ maxWidth: 1366, margin: "0 auto" }}>
          <div className="panel-head">
            <h2>Tagesplanung</h2>
            <div className="button-row wrap">
              <button className="btn secondary" onClick={newDayPlan}>Neu</button>
              <button className="btn primary" onClick={saveCurrentDayPlan}>Speichern</button>
            </div>
          </div>

          <div className="box">
            <div className="form-grid four">
              <label>
                <span>Datum</span>
                <input type="date" value={dayPlan.date} onChange={(e) => setDayPlan((prev) => ({ ...prev, date: e.target.value, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>PLZ</span>
                <input value={dayPlan.zipFilter} onChange={(e) => setDayPlan((prev) => ({ ...prev, zipFilter: e.target.value, updatedAt: new Date().toISOString() }))} placeholder="z. B. 854..." />
              </label>
              <label>
                <span>Ort</span>
                <input value={dayPlan.cityFilter} onChange={(e) => setDayPlan((prev) => ({ ...prev, cityFilter: e.target.value, updatedAt: new Date().toISOString() }))} placeholder="Ort filtern" />
              </label>
              <label>
                <span>Suche</span>
                <input value={dayPlan.searchText} onChange={(e) => setDayPlan((prev) => ({ ...prev, searchText: e.target.value, updatedAt: new Date().toISOString() }))} placeholder="Firma, Kundennr., Ansprechpartner" />
              </label>
            </div>
            <div className="summary-line" style={{ marginTop: 12 }}>
              <span className="plan-count">{planningSearchResults.length} Kunden gefunden</span>
              <button className="btn secondary" onClick={addSelectedCustomersToDayPlan}>Zur Tagesplanung hinzufügen</button>
            </div>
          </div>

          <div className="planning-grid" style={{ marginTop: 16 }}>
            <div className="box">
              <div className="panel-head small">
                <h3>Kundenstamm Treffer</h3>
                <span className="plan-count">{selectedPlanningCustomers.length} ausgewählt</span>
              </div>
              <div className="table-wrap tall">
                <table className="data-table planning-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Kundennr.</th>
                      <th>Firma</th>
                      <th>PLZ / Ort</th>
                      <th>Ansprechpartner</th>
                      <th>Telefon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningSearchResults.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedPlanningCustomers.includes(customer.id)}
                            onChange={() => togglePlanningCustomerSelection(customer.id)}
                          />
                        </td>
                        <td>{customer.customerNo || "-"}</td>
                        <td>{customer.company || "-"}</td>
                        <td>{[customer.zip, customer.city].filter(Boolean).join(" ") || "-"}</td>
                        <td>{customer.contactPerson || "-"}</td>
                        <td>{customer.contactPhone || customer.phone || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="box">
              <div className="panel-head small">
                <h3>Gespeicherte Tagespläne</h3>
                <span className="plan-count">{dayPlans.length} gespeichert</span>
              </div>
              <div className="planning-list">
                {dayPlans.length ? dayPlans.map((plan) => (
                  <div key={plan.id} className={plan.id === dayPlan.id ? "saved-plan-card active" : "saved-plan-card"}>
                    <strong>{plan.date}</strong>
                    <span>{plan.items.length} Kunden • {plan.zipFilter || "alle PLZ"}</span>
                    <div className="tiny-actions">
                      <button className="mini-btn" onClick={() => loadDayPlan(plan)}>Laden</button>
                      <button className="mini-btn" onClick={() => deleteDayPlan(plan.id)}>Löschen</button>
                    </div>
                  </div>
                )) : <div className="planning-empty">Noch keine Tagesplanung gespeichert.</div>}
              </div>
            </div>
          </div>

          <div className="box" style={{ marginTop: 16 }}>
            <div className="panel-head small">
              <h3>Geplante Kunden</h3>
              <span className="plan-count">{sortedPlannedItems.length} Einträge</span>
            </div>

            <div className="planning-list">
              {sortedPlannedItems.length ? sortedPlannedItems.map((item, index) => {
                const customer = planningCustomerMap.get(item.customerId);
                if (!customer) return null;
                const products = getPlanningCustomerProducts(item.customerId);

                return (
                  <div key={item.id} className={item.isDone ? "planning-card done" : "planning-card"}>
                    <div className="planning-card-top">
                      <div>
                        <strong>{customer.company || "Ohne Firma"}</strong>
                        <div className="plan-count">
                          {customer.customerNo || "-"} • {[customer.zip, customer.city].filter(Boolean).join(" ")} • {customer.street || "-"}
                        </div>
                        <div className="plan-count">
                          Ansprechpartner: {customer.contactPerson || "-"} • {customer.contactPhone || customer.phone || "-"}
                        </div>
                      </div>

                      <div className="tiny-actions">
                        <button className="mini-btn" onClick={() => movePlannedCustomer(item.id, "up")}>↑</button>
                        <button className="mini-btn" onClick={() => movePlannedCustomer(item.id, "down")}>↓</button>
                        <button className="mini-btn" onClick={() => openPlannedCustomerDetails(item)}>Kundendetails</button>
                        <button className="mini-btn" onClick={() => transferPlannedCustomerToOrder(item)}>In Auftrag</button>
                        <button className="mini-btn" onClick={() => removePlannedCustomer(item.id)}>Entfernen</button>
                      </div>
                    </div>

                    <div className="planning-card-grid">
                      <div>
                        <h3 style={{ marginBottom: 8 }}>Bestandsprodukte</h3>
                        <div className="planning-products">
                          {products.length ? products.slice(0, 12).map((product) => (
                            <span key={product} className="planning-chip">
                              • {product}
                            </span>
                          )) : <span className="plan-count">Noch keine gekauften Produkte</span>}
                        </div>
                      </div>

                      <div>
                        <label>
                          <span>Geplante neue Produkte / Demo</span>
                          <textarea
                            rows={5}
                            value={item.plannedProducts}
                            onChange={(e) => updatePlannedCustomer(item.id, { plannedProducts: e.target.value })}
                            placeholder="Hier geplante Vorführprodukte oder neue Produkte eintragen"
                          />
                        </label>
                      </div>

                      <div>
                        <label>
                          <span>Notizen zum Besuch</span>
                          <textarea
                            rows={5}
                            value={item.notes}
                            onChange={(e) => updatePlannedCustomer(item.id, { notes: e.target.value })}
                            placeholder="z. B. Uhrzeit, Ziel, Gesprächsnotiz"
                          />
                        </label>
                        <div style={{ marginTop: 10 }}>
                          <label className="done-toggle">
                            <input
                              type="checkbox"
                              checked={item.isDone}
                              onChange={(e) => updatePlannedCustomer(item.id, { isDone: e.target.checked })}
                            />
                            Erledigt
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : <div className="planning-empty">Noch keine Kunden in der Tagesplanung. Wähle links Kunden aus und füge sie hinzu.</div>}
            </div>
          </div>
        </section>
      )}

      {tab === "kunden" && (
        <section className="panel" style={{ maxWidth: 1366, margin: "0 auto" }}>
          <div className="panel-head">
            <h2>Kunden</h2>
            <input className="search" value={searchCustomer} onChange={(e) => setSearchCustomer(e.target.value)} placeholder="Kunde suchen" />
          </div>

          <div className="table-wrap tall">
            <table className="data-table">
              <thead><tr><th>Kundennr.</th><th>Firma</th><th>Ort</th><th>Ansprechpartner</th><th>AP Telefon</th><th>E-Mail</th><th>Vermerke</th></tr></thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setSelectedCustomer(c)}>
                    <td>{c.customerNo || "-"}</td>
                    <td>{c.company}</td>
                    <td>{[c.zip, c.city].filter(Boolean).join(" ")}</td>
                    <td>{c.contactPerson || "-"}</td>
                    <td>{c.contactPhone || "-"}</td>
                    <td>{c.emailInvoice || "-"}</td>
                    <td>{c.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "artikel" && (
        <section className="panel" style={{ maxWidth: 1366, margin: "0 auto" }}>
          <div className="panel-head">
            <h2>Artikel</h2>
            <input className="search" value={searchArticle} onChange={(e) => setSearchArticle(e.target.value)} placeholder="Artikel suchen" />
          </div>

          <div className="table-wrap tall">
            <table className="data-table">
              <thead><tr><th>Art.-Nr.</th><th>Warenbezeichnung</th><th>Einzelpreis</th></tr></thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.articleNo}>
                    <td>{p.articleNo}</td>
                    <td>{p.description}</td>
                    <td>{money(p.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "archiv" && (
        <section className="panel" style={{ maxWidth: 1366, margin: "0 auto" }}>
          <div className="panel-head">
            <h2>Archiv</h2>
            <div className="button-row wrap">
              <input className="search" value={searchArchive} onChange={(e) => setSearchArchive(e.target.value)} placeholder="Archiv durchsuchen" />
              <select value={archiveTypeFilter} onChange={(e) => setArchiveTypeFilter(e.target.value as "alle" | "auftrag" | "lieferschein" | "demo")}>
                <option value="alle">Alle Typen</option>
                <option value="auftrag">Auftrag</option>
                <option value="lieferschein">Lieferschein</option>
                <option value="demo">Demo</option>
              </select>
            </div>
          </div>

          <div className="stack">
            {archive.map((monthGroup, monthIndex) => {
              const isOpen = openArchiveMonths[monthGroup.month] ?? monthIndex === 0;
              return (
                <div key={monthGroup.month} className="archive-group">
                  <button className="archive-head" onClick={() => setOpenArchiveMonths((prev) => ({ ...prev, [monthGroup.month]: !isOpen }))}>
                    <div>
                      <strong>{monthLabel(monthGroup.month)}</strong>
                      <span>{monthGroup.days.reduce((sum, day) => sum + day.orders.length, 0)} Aufträge</span>
                    </div>
                    <span>{isOpen ? "Einklappen" : "Aufklappen"}</span>
                  </button>

                  {isOpen && monthGroup.days.map((dayGroup, dayIndex) => {
                    const dayKey = `${monthGroup.month}-${dayGroup.date}`;
                    const isDayOpen = openArchiveDays[dayKey] ?? dayIndex === 0;
                    return (
                      <div key={dayGroup.date} className="archive-day">
                        <button
                          className="archive-day-toggle"
                          onClick={() =>
                            setOpenArchiveDays((prev) => ({
                              ...prev,
                              [dayKey]: !isDayOpen,
                            }))
                          }
                        >
                          <span className="archive-day-label">{dayLabel(dayGroup.date)}</span>
                          <span className="archive-day-meta">
                            {dayGroup.orders.length} Aufträge • {isDayOpen ? "Einklappen" : "Aufklappen"}
                          </span>
                        </button>

                        {isDayOpen && (
                          <div className="archive-cards">
                            {dayGroup.orders.map((saved) => (
                              <div key={saved.id} className="archive-card">
                                <strong>{saved.company || "Ohne Firma"}</strong>
                                <span>{saved.date} • {saved.customerNo || "-"} • {historyMap.get(saved.id)?.displayType || "Verkauf"}</span>
                                <span>{money(saved.total || orderTotal(saved))}</span>
                                <div className="button-row wrap">
                                  <button className="btn secondary" onClick={() => { setOrder({ ...saved, lines: ensureRows(saved.lines || []) }); setTab("auftrag"); }}>Laden</button>
                                  <button className="btn secondary" onClick={() => duplicateOrder(saved)}>Duplizieren</button>
                                  <button className="btn danger" onClick={() => deleteOrder(saved.id)}>Löschen</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h2>{selectedCustomer.company || "Kundendetails"}</h2>
              <button className="btn secondary" onClick={() => setSelectedCustomer(null)}>Schließen</button>
            </div>

            <div className="customer-modal-grid" style={{ maxWidth: "100%", alignItems: "start" }}>
              <div className="box">
                <h3>Stammdaten</h3>
                <div className="info-list">
                  <div><strong>Kundennr.:</strong> {selectedCustomer.customerNo || "-"}</div>
                  <div><strong>Firma:</strong> {selectedCustomer.company || "-"}</div>
                  <div><strong>Adresse:</strong> {[selectedCustomer.street, [selectedCustomer.zip, selectedCustomer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "-"}</div>
                  <div><strong>Telefon:</strong> {selectedCustomer.phone || "-"}</div>
                  <div><strong>Fax:</strong> {selectedCustomer.fax || "-"}</div>
                  <div><strong>E-Mail:</strong> {selectedCustomer.emailInvoice || "-"}</div>
                  <div><strong>Ansprechpartner:</strong> {selectedCustomer.contactPerson || "-"}</div>
                  <div><strong>AP Telefon:</strong> {selectedCustomer.contactPhone || "-"}</div>
                  <div><strong>Lieferadresse:</strong> {selectedCustomer.deliveryAddress || "-"}</div>
                  <div><strong>Vermerke:</strong> {selectedCustomer.notes || "-"}</div>
                </div>

                <div className="totals-grid">
                  <div className="box"><span>Bisherige Aufträge</span><strong>{selectedCustomerTotals.orders}</strong></div>
                  <div className="box"><span>Gesamtumsatz</span><strong>{money(selectedCustomerTotals.amount)}</strong></div>
                </div>
              </div>

              <div className="customer-right-sections">
                <div className="box">
                  <h3>Gekaufte Artikel gesamt</h3>
                  <div className="table-wrap small">
                    <table className="data-table">
                      <thead><tr><th>Art.-Nr.</th><th>Bezeichnung</th><th>Menge</th><th>Umsatz</th><th>Verkäufe</th><th>Demos</th></tr></thead>
                      <tbody>
                        {selectedCustomerProducts.map((item) => (
                          <tr key={item.key}>
                            <td>{item.articleNo || "-"}</td>
                            <td>{item.description || "-"}</td>
                            <td>{item.quantity}</td>
                            <td>{money(item.amount)}</td>
                            <td>{item.orders}</td>
                            <td>{item.demos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="box">
                  <h3>Bisherige Aufträge</h3>
                  <div className="table-wrap small">
                    <table className="data-table">
                      <thead><tr><th>Datum</th><th>Typ</th><th>Summe</th><th>Mitarbeiter</th><th>Kommentar</th></tr></thead>
                      <tbody>
                        {selectedCustomerOrders.map((savedOrder) => (
                          <tr key={savedOrder.id}>
                            <td>{savedOrder.date}</td>
                            <td>{selectedCustomerHistory.get(savedOrder.id)?.displayType || "Verkauf"}</td>
                            <td>{money(savedOrder.total || orderTotal(savedOrder))}</td>
                            <td>{savedOrder.employee || "-"}</td>
                            <td>{savedOrder.dailyComment || savedOrder.notes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (

        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Einrichtung</h2>
            <div className="stack" style={{ marginTop: 16 }}>
              <label><span>Mitarbeitername</span><input value={settings.employeeName} onChange={(e) => setSettings((s) => ({ ...s, employeeName: e.target.value }))} /></label>
              <label><span>Mitarbeiter E-Mail</span><input value={settings.employeeEmail} onChange={(e) => setSettings((s) => ({ ...s, employeeEmail: e.target.value }))} /></label>
              <label><span>Gebietsnummer</span><input value={settings.areaCode} onChange={(e) => setSettings((s) => ({ ...s, areaCode: e.target.value }))} /></label>
              <label><span>Empfänger E-Mail</span><input value={settings.defaultRecipient} onChange={(e) => setSettings((s) => ({ ...s, defaultRecipient: e.target.value }))} /></label>
              <label><span>CC / weiterer Empfänger</span><input value={settings.ccRecipient} onChange={(e) => setSettings((s) => ({ ...s, ccRecipient: e.target.value }))} /></label>

              <div className="button-row wrap">
                <button className="btn secondary" onClick={exportBackup}>Backup exportieren</button>
                <button className="btn secondary" onClick={() => importRef.current?.click()}>Backup importieren</button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importBackup(file);
                    e.currentTarget.value = "";
                  }}
                />
              </div>

              <div className="button-row wrap">
                <button className="btn danger" onClick={resetApp}>Komplette Datenbank löschen</button>
                <button className="btn primary" onClick={saveSettings}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
