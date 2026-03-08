
import React, { useEffect, useMemo, useRef, useState } from "react";

const DB_NAME = "most-vite-db-v3";
const DB_VERSION = 1;
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

type GeneratedPdf = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  settings: Settings;
  customers: Customer[];
  products: Product[];
  orders: Order[];
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

function getCustomerIdentity(order: Pick<Order, "customerId" | "customerNo" | "company" | "street" | "city"> | Pick<Customer, "id" | "customerNo" | "company" | "street" | "city">) {
  const idValue = "customerId" in order ? order.customerId : order.id;
  if (idValue) return `id:${idValue}`;
  if (order.customerNo.trim()) return `no:${order.customerNo.trim()}`;
  return `addr:${[order.company, order.street, order.city].map((v) => v.trim().toLowerCase()).join("|")}`;
}

function getLineIdentity(line: Line) {
  return `${line.articleNo.trim().toLowerCase()}||${line.description.trim().toLowerCase()}`;
}

function findExistingCustomer(order: Order, customers: Customer[]) {
  if (order.customerId) return customers.find((c) => c.id === order.customerId) || null;
  if (order.customerNo.trim()) return customers.find((c) => c.customerNo.trim() === order.customerNo.trim()) || null;
  const key = [order.company, order.street, order.city].map((v) => v.trim().toLowerCase()).join("|");
  return customers.find((c) => [c.company, c.street, c.city].map((v) => v.trim().toLowerCase()).join("|") === key) || null;
}

function orderBelongsToCustomer(order: Order, customer: Customer) {
  return getCustomerIdentity(order) === getCustomerIdentity(customer);
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
    const customerIdentity = getCustomerIdentity(order);
    const seen = seenProductsByCustomer.get(customerIdentity) || new Set<string>();
    seenProductsByCustomer.set(customerIdentity, seen);

    const firstProducts: string[] = [];
    const repeatProducts: string[] = [];
    let hasAnySale = false;

    order.lines.filter(lineFilled).forEach((line) => {
      const key = getLineIdentity(line);
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
        const key = getLineIdentity(line);
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
        .map(([date, orders]) => ({
          date,
          orders: [...orders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
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
        const target = canvasRef.current?.getContext("2d");
        if (!target || !canvasRef.current) return;
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
    if (!hasIndexedDb()) {
      setStatus("IndexedDB fehlt in dieser Umgebung");
      return;
    }

    (async () => {
      const savedSettings = await dbGet<Settings & { id: string }>("settings", "profile");
      const loadedCustomers = await dbGetAll<Customer>("customers");
      const loadedProducts = await dbGetAll<Product>("products");
      const loadedOrders = await dbGetAll<Order>("orders");

      setCustomers(loadedCustomers);
      setProducts(loadedProducts);
      setOrders(loadedOrders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));

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
            ? {
                ...line,
                articleNo: product.articleNo,
                description: product.description,
                unitPrice: String(product.unitPrice),
              }
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

  const registerGeneratedPdf = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setGeneratedPdfs((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [{ id: `${Date.now()}-${Math.random()}`, name, url, createdAt: new Date().toISOString() }];
    });
    return url;
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

  const exportCurrentOrder = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("p", "mm", "a4");
    const printableLines = ensureRows(order.lines);
    const pages = Math.max(1, Math.ceil(printableLines.length / DEFAULT_ROWS));

    for (let page = 0; page < pages; page += 1) {
      if (page > 0) doc.addPage();

      doc.roundedRect(10, 10, 190, 24, 3, 3);
      try {
        if (MOST_LOGO) doc.addImage(MOST_LOGO, "SVG", 14, 13, 14, 14);
      } catch {}
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(order.orderType === "lieferschein" ? "LIEFERSCHEIN" : "AUFTRAG", 34, 21);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Datum: ${order.date}`, 150, 16);
      doc.text(`Mitarbeiter: ${order.employee || "-"}`, 150, 21);
      doc.text(`Kundennr.: ${order.customerNo || "-"}`, 150, 26);
      doc.text(`Seite ${page + 1}/${pages}`, 150, 31);

      doc.roundedRect(10, 38, 190, 32, 3, 3);
      doc.setFont("helvetica", "bold");
      doc.text("Kundendaten", 14, 45);
      doc.setFont("helvetica", "normal");
      doc.text(`Firma: ${order.company || "-"}`, 14, 51);
      doc.text(`Straße: ${order.street || "-"}`, 14, 57);
      doc.text(`PLZ / Ort: ${[order.zip, order.city].filter(Boolean).join(" ") || "-"}`, 14, 63);
      doc.text(`Telefon: ${order.phone || "-"}`, 105, 51);
      doc.text(`Ansprechpartner: ${order.contactPerson || "-"}`, 105, 57);
      doc.text(`AP Telefon: ${order.contactPhone || "-"}`, 105, 63);

      const tableTop = 78;
      doc.roundedRect(10, tableTop, 190, 122, 3, 3);
      doc.setFillColor(241, 245, 249);
      doc.rect(10, tableTop, 190, 10, "F");
      [22, 54, 74, 146, 173].forEach((x) => doc.line(x, tableTop, x, tableTop + 122));
      for (let i = 0; i <= DEFAULT_ROWS; i += 1) {
        doc.line(10, tableTop + 10 + i * 8, 200, tableTop + 10 + i * 8);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Pos.", 13, tableTop + 6.5);
      doc.text("Art.-Nr.", 27, tableTop + 6.5);
      doc.text("Menge", 58, tableTop + 6.5);
      doc.text("Warenbezeichnung", 78, tableTop + 6.5);
      doc.text("EP", 153, tableTop + 6.5);
      doc.text("Gesamt", 178, tableTop + 6.5);
      doc.setFont("helvetica", "normal");

      printableLines.slice(page * DEFAULT_ROWS, (page + 1) * DEFAULT_ROWS).forEach((line, idx) => {
        const y = tableTop + 16 + idx * 8;
        doc.text(String(page * DEFAULT_ROWS + idx + 1), 13, y);
        doc.text(String(line.articleNo || ""), 24, y);
        doc.text(String(line.quantity || ""), 58, y);
        doc.text(String(line.description || "").slice(0, 38), 76, y);
        doc.text(money(normalizeNumber(line.unitPrice)), 148, y);
        doc.text(money(lineTotal(line)), 190, y, { align: "right" });
      });

      if (page === pages - 1) {
        doc.roundedRect(10, 206, 190, 56, 3, 3);
        doc.setFont("helvetica", "bold");
        doc.text(`Gesamtsumme: ${money(orderTotal(order))}`, 145, 214);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Bestellnr.: ${order.customerOrderNo || "-"}`, 14, 214);
        doc.text(`Kommission: ${order.commission || "-"}`, 14, 220);
        doc.text(`Lieferadresse: ${(order.deliveryAddress || "-").slice(0, 80)}`, 14, 226);
        doc.text(`Vermerke: ${(order.notes || "-").slice(0, 88)}`, 14, 232);
        doc.text(`Kommentar: ${(order.dailyComment || "-").slice(0, 86)}`, 14, 238);
        doc.text(`Klarschrift: ${order.signatureName || "-"}`, 14, 252);
        if (order.signatureDataUrl) {
          try {
            doc.addImage(order.signatureDataUrl, "PNG", 120, 240, 48, 14);
          } catch {}
        }
      }
    }

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
    const rows = todayRows;
    const rowsPerPage = 12;
    const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

    for (let page = 0; page < pages; page += 1) {
      if (page > 0) doc.addPage();

      doc.roundedRect(10, 10, 190, 22, 3, 3);
      try {
        if (MOST_LOGO) doc.addImage(MOST_LOGO, "SVG", 14, 13, 14, 14);
      } catch {}
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("TAGESBERICHT", 34, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Datum: ${today()}`, 150, 16);
      doc.text(`Gebiet: ${settings.areaCode || order.area || "-"}`, 150, 21);
      doc.text(`Seite ${page + 1}/${pages}`, 150, 26);

      doc.roundedRect(10, 38, 190, 160, 3, 3);
      doc.setFillColor(241, 245, 249);
      doc.rect(10, 38, 190, 10, "F");
      [24, 40, 96, 130, 164, 182].forEach((x) => doc.line(x, 38, x, 198));
      for (let i = 0; i <= rowsPerPage; i += 1) doc.line(10, 48 + i * 12.5, 200, 48 + i * 12.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Nr.", 13, 44.5);
      doc.text("Cod.", 28, 44.5);
      doc.text("Name / Adresse", 43, 44.5);
      doc.text("Nachbest.", 100, 44.5);
      doc.text("Erstbest. / Demo", 133, 44.5);
      doc.text("Summe", 168, 44.5);
      doc.text("Kommentar", 184, 44.5, { align: "center" });
      doc.setFont("helvetica", "normal");

      rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage).forEach((row, idx) => {
        const y = 55 + idx * 12.5;
        doc.text(String(row.no), 13, y);
        doc.text(row.code, 28, y);
        doc.text(doc.splitTextToSize(row.nameAddress.replace(/\n/g, ", "), 50), 42, y - 2);
        doc.text(doc.splitTextToSize(row.productRepeat || "", 28), 98, y - 2);
        doc.text(doc.splitTextToSize(row.productFirst || "", 30), 132, y - 2);
        doc.text(money(row.amount), 166, y);
        doc.text(doc.splitTextToSize(row.comment || "", 15), 183, y - 2, { align: "center" });
      });

      doc.roundedRect(10, 206, 90, 50, 3, 3);
      doc.roundedRect(110, 206, 90, 50, 3, 3);
      doc.setFont("helvetica", "bold");
      doc.text("Tagesergebnis", 14, 214);
      doc.text("Monatsergebnis", 114, 214);
      doc.setFont("helvetica", "normal");
      doc.text(`Besuche: ${todayTotals.visits}`, 14, 222);
      doc.text(`Demos: ${todayTotals.demos}`, 14, 229);
      doc.text(`Verkäufe: ${todayTotals.sales}`, 14, 236);
      doc.text(`Summe: ${money(todayTotals.amount)}`, 14, 243);
      doc.text(`Besuche: ${monthTotals.visits}`, 114, 222);
      doc.text(`Demos: ${monthTotals.demos}`, 114, 229);
      doc.text(`Verkäufe: ${monthTotals.sales}`, 114, 236);
      doc.text(`Summe: ${money(monthTotals.amount)}`, 114, 243);
    }

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

  const exportBackup = () => {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      customers,
      products,
      orders,
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

    setSettings(parsed.settings);
    setCustomers(await dbGetAll<Customer>("customers"));
    setProducts(await dbGetAll<Product>("products"));
    setOrders((await dbGetAll<Order>("orders")).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setOrder(emptyOrder(parsed.settings.employeeName, parsed.settings.areaCode));
    setStatus("Backup importiert");
  };

  const resetApp = async () => {
    await deleteWholeDb();
    setSettings(emptySettings);
    setCustomers([]);
    setProducts([]);
    setOrders([]);
    setGeneratedPdfs((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setOrder(emptyOrder("", ""));
    setSelectedCustomer(null);
    setSettingsOpen(true);
    setStatus("App zurückgesetzt");
  };

  return (
    <div className="app-shell">
      <style>{`
        :root{
          --bg:#f3f6fb;--panel:#ffffff;--line:#d9e2ec;--muted:#64748b;--text:#0f172a;
          --green:#16a34a;--greenDark:#15803d;--blue:#2563eb;--blueDark:#1d4ed8;
          --shadow:0 14px 34px rgba(15,23,42,.08)
        }
        *{box-sizing:border-box}
        body{margin:0;font-family:Inter,Arial,sans-serif;background:linear-gradient(135deg,#f7fafc 0%,#eff6ff 55%,#ecfdf5 100%);color:var(--text)}
        h1,h2,h3,p{margin:0}
        .app-shell{min-height:100vh;padding:24px}
        .app-header,.panel,.modal{background:rgba(255,255,255,.96);border:1px solid rgba(217,226,236,.95);border-radius:24px;box-shadow:var(--shadow);backdrop-filter:blur(10px)}
        .app-header{max-width:1366px;margin:0 auto 18px;display:flex;justify-content:space-between;gap:16px;padding:22px 24px;align-items:center}
        .brand{display:flex;gap:16px;align-items:center}
        .brand p{margin-top:6px;color:var(--muted)}
        .logo{width:58px;height:58px;border-radius:14px;box-shadow:0 6px 16px rgba(21,92,51,.2)}
        .status-box{font-size:14px;display:grid;gap:6px;color:var(--muted)}
        .status-box strong{color:var(--text)}
        .tabs-row{max-width:1366px;margin:0 auto 18px;display:flex;gap:8px;flex-wrap:wrap}
        .tab{padding:12px 18px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.92);cursor:pointer;color:var(--text);font-weight:600;transition:.18s ease}
        .tab:hover{transform:translateY(-1px);box-shadow:0 8px 16px rgba(15,23,42,.06)}
        .tab.active{background:linear-gradient(135deg,var(--green) 0%,var(--greenDark) 100%);color:#fff;border-color:transparent}
        .grid-2{max-width:1366px;margin:0 auto;display:grid;grid-template-columns:1.65fr 1fr;gap:18px}
        .panel{padding:22px}
        .side-stack{display:grid;gap:18px}
        .compact{display:grid;gap:14px}
        .panel-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
        .small{margin-bottom:12px}
        .button-row{display:flex;gap:8px}
        .wrap{flex-wrap:wrap}
        .btn{border:1px solid var(--line);background:#fff;border-radius:14px;padding:10px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:600;transition:.18s ease}
        .btn:hover{transform:translateY(-1px)}
        .btn.primary{background:linear-gradient(135deg,var(--green) 0%,var(--greenDark) 100%);color:#fff;border-color:transparent}
        .btn.primary.blue{background:linear-gradient(135deg,var(--blue) 0%,var(--blueDark) 100%);border-color:transparent}
        .btn.secondary{background:#fff}
        .btn.danger{background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:#fff;border-color:transparent}
        .btn.full{width:100%;justify-content:center}
        .form-grid{display:grid;gap:12px}
        .form-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}
        .form-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
        label span{display:block;font-size:13px;margin-bottom:7px;color:var(--muted);font-weight:600}
        input,select,textarea{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:14px;font:inherit;background:#fff;transition:border-color .18s ease, box-shadow .18s ease}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#93c5fd;box-shadow:0 0 0 4px rgba(37,99,235,.12)}
        .checks{display:flex;gap:20px;flex-wrap:wrap;background:linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid var(--line);border-radius:18px;padding:15px 16px;margin:18px 0}
        .checks label{display:flex;align-items:center;gap:8px;font-weight:600}
        .box{border:1px solid var(--line);border-radius:18px;padding:18px;background:linear-gradient(180deg,#fff 0%,#fbfdff 100%)}
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
        .suggestions{position:absolute;left:0;top:calc(100% + 6px);z-index:20;background:#fff;border:1px solid var(--line);border-radius:14px;padding:6px;width:340px;max-height:220px;overflow:auto;box-shadow:0 18px 34px rgba(15,23,42,.12)}
        .suggestions button,.dropdown-item{display:flex;flex-direction:column;align-items:flex-start;width:100%;border:0;background:#fff;padding:9px 10px;border-radius:10px;cursor:pointer}
        .suggestions button span,.dropdown-item span{color:var(--muted);font-size:13px}
        .suggestions button:hover,.dropdown-item:hover{background:#f8fafc}
        .dropdown-list{margin-top:8px;border:1px solid var(--line);border-radius:14px;max-height:240px;overflow:auto;background:#fff}
        .icon-btn{border:1px solid var(--line);background:#fff;border-radius:12px;padding:6px 8px;cursor:pointer}
        .metric{background:linear-gradient(180deg,#f8fafc 0%,#eff6ff 100%);border-radius:18px;padding:16px;display:grid;gap:7px}
        .metric span{color:var(--muted)}
        .metric strong{font-size:28px;line-height:1}
        .pdf-card{border:1px solid var(--line);border-radius:18px;padding:14px;display:grid;gap:10px;background:#fff}
        .sublist{display:grid;gap:8px}
        .search{min-width:240px}
        .stack{display:grid;gap:16px}
        .archive-group{border:1px solid var(--line);border-radius:18px;background:#fff}
        .archive-head{width:100%;display:flex;justify-content:space-between;align-items:center;padding:16px;border:0;background:linear-gradient(180deg,#f8fafc 0%,#eff6ff 100%);border-radius:18px;cursor:pointer}
        .archive-head span{color:var(--muted)}
        .archive-day{display:grid;gap:12px;padding:16px}
        .archive-day-label{font-weight:700;border-bottom:1px solid #edf2f7;padding-bottom:8px}
        .archive-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .archive-card{border:1px solid var(--line);border-radius:18px;padding:16px;display:grid;gap:8px;background:#fff}
        .archive-card span{color:var(--muted)}
        .preline{white-space:pre-line}
        .clickable{cursor:pointer}
        .clickable:hover td{background:#f8fbff}
        .pill{padding:8px 12px;background:#f8fafc;border:1px solid var(--line);border-radius:999px;font-size:13px;color:#334155}
        .modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px;z-index:50}
        .modal{width:min(760px,100%);max-height:90vh;overflow:auto;padding:22px}
        .modal.large{width:min(1220px,100%)}
        .info-list{display:grid;gap:8px}
        .signature-box{display:grid;gap:8px}
        .signature-canvas{width:100%;height:140px;border:1px solid var(--line);border-radius:14px;background:#fff}
        @media (max-width: 980px){
          .grid-2,.archive-cards,.form-grid.four,.form-grid.two{grid-template-columns:1fr}
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
        {(["auftrag", "tagesbericht", "kunden", "artikel", "archiv"] as const).map((item) => (
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

            <div className="grid-2">
              <div className="box">
                <div className="panel-head small">
                  <h3>Kunde</h3>
                  <button className="btn secondary" onClick={saveCustomerFromOrder}>Kunde speichern</button>
                </div>

                <label><span>Kunde suchen</span><input value={customerLookup} onChange={(e) => { setCustomerLookup(e.target.value); setCustomerDropdownOpen(true); }} onFocus={() => setCustomerDropdownOpen(true)} placeholder="Name, Ort oder Straße" /></label>
                {customerDropdownOpen && (
                  <div className="dropdown-list">
                    {customerLookupResults.map((c) => (
                      <button key={c.id} className="dropdown-item" onClick={() => applyCustomer(c)}>
                        <strong>{c.company || "Ohne Firma"}</strong>
                        <span>{[c.customerNo || "-", c.city, c.street, c.contactPerson].filter(Boolean).join(" • ")}</span>
                      </button>
                    ))}
                  </div>
                )}

                <label><span>Kundennummer</span><input value={order.customerNo} onChange={(e) => updateOrder("customerNo", e.target.value)} /></label>
                <label><span>Kundenbestellnr.</span><input value={order.customerOrderNo} onChange={(e) => updateOrder("customerOrderNo", e.target.value)} /></label>
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
                    <tr><th></th><th>Pos.</th><th>Art.-Nr.</th><th>Menge</th><th>Warenbezeichnung</th><th>Einzelpreis</th><th>Gesamtpreis</th></tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line, index) => (
                      <tr key={line.id}>
                        <td><button className="icon-btn" onClick={() => setOrder((prev) => ({ ...prev, lines: ensureRows(prev.lines.map((item, i) => (i === index ? emptyLine(i + 1) : item))) }))}>🗑</button></td>
                        <td>{index + 1}</td>
                        <td>
                          <div className="suggest-wrap">
                            <input value={line.articleNo} onChange={(e) => updateLine(index, "articleNo", e.target.value)} onFocus={() => setArticleSuggestionIndex(index)} onBlur={() => setTimeout(() => setArticleSuggestionIndex((prev) => (prev === index ? null : prev)), 120)} />
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
                        <td><input value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} /></td>
                        <td><input value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} /></td>
                        <td><input value={line.unitPrice} onChange={(e) => updateLine(index, "unitPrice", e.target.value)} /></td>
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

            <div className="grid-2">
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
              <button className="btn primary full" onClick={() => setSettingsOpen(true)}>Einrichtung</button>
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

          <div className="grid-2" style={{ maxWidth: "100%" }}>
            <div className="box">
              <h3>Tagesergebnis</h3>
              <div className="row-between"><span>Besuche</span><strong>{todayTotals.visits}</strong></div>
              <div className="row-between"><span>Demos</span><strong>{todayTotals.demos}</strong></div>
              <div className="row-between"><span>Verkäufe</span><strong>{todayTotals.sales}</strong></div>
              <div className="row-between"><span>Summe</span><strong>{money(todayTotals.amount)}</strong></div>
            </div>
            <div className="box">
              <h3>Monatsergebnis</h3>
              <div className="row-between"><span>Besuche</span><strong>{monthTotals.visits}</strong></div>
              <div className="row-between"><span>Demos</span><strong>{monthTotals.demos}</strong></div>
              <div className="row-between"><span>Verkäufe</span><strong>{monthTotals.sales}</strong></div>
              <div className="row-between"><span>Summe</span><strong>{money(monthTotals.amount)}</strong></div>
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

                  {isOpen && monthGroup.days.map((dayGroup) => (
                    <div key={dayGroup.date} className="archive-day">
                      <div className="archive-day-label">{dayLabel(dayGroup.date)}</div>
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
                    </div>
                  ))}
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

            <div className="grid-2" style={{ maxWidth: "100%" }}>
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

                <div className="grid-2" style={{ maxWidth: "100%", marginTop: 16 }}>
                  <div className="box"><span>Bisherige Aufträge</span><strong>{selectedCustomerTotals.orders}</strong></div>
                  <div className="box"><span>Gesamtumsatz</span><strong>{money(selectedCustomerTotals.amount)}</strong></div>
                </div>
              </div>

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

                <h3 style={{ marginTop: 16 }}>Bisherige Aufträge</h3>
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
