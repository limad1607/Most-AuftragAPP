import React, { useEffect, useMemo, useRef, useState } from 'react';

const DB_NAME = 'most-vite-db-v1';
const DB_VERSION = 1;
const DEFAULT_ROWS = 8;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);

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
  orderType: 'auftrag' | 'lieferschein';
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

type BackupPayload = {
  version: number;
  exportedAt: string;
  settings: Settings;
  customers: Customer[];
  products: Product[];
  orders: Order[];
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

const emptySettings: Settings = {
  employeeName: '',
  employeeEmail: '',
  defaultRecipient: '',
  ccRecipient: '',
  areaCode: '',
};

const emptyLine = (position: number): Line => ({
  id: `${Date.now()}-${position}-${Math.random().toString(36).slice(2, 8)}`,
  position,
  articleNo: '',
  quantity: '',
  description: '',
  unitPrice: '',
});

const emptyOrder = (employee = '', area = ''): Order => ({
  id: `draft-${Date.now()}`,
  date: today(),
  employee,
  customerNo: '',
  customerOrderNo: '',
  company: '',
  street: '',
  zip: '',
  city: '',
  phone: '',
  fax: '',
  emailInvoice: '',
  deliveryAddress: '',
  commission: '',
  area,
  trainer: '',
  contactPerson: '',
  contactPhone: '',
  notes: '',
  dailyComment: '',
  signatureName: '',
  signatureDataUrl: '',
  orderType: 'auftrag',
  isFirstOrder: false,
  isFollowUp: false,
  isPhonePost: false,
  lines: Array.from({ length: DEFAULT_ROWS }, (_, i) => emptyLine(i + 1)),
});

function normalizeNumber(value: string | number | null | undefined) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  if (hasComma && hasDot) return Number(raw.replace(/\./g, '').replace(/,/g, '.')) || 0;
  if (hasComma) return Number(raw.replace(/,/g, '.')) || 0;
  return Number(raw) || 0;
}

function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
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
  return Boolean(order.company || order.customerNo || order.dailyComment || order.lines.some(lineFilled));
}

function customerKey(item: Pick<Order, 'customerId' | 'customerNo' | 'company' | 'street' | 'city'> | Pick<Customer, 'id' | 'customerNo' | 'company' | 'street' | 'city'>) {
  const byId = 'customerId' in item ? item.customerId : item.id;
  if (byId) return `id:${byId}`;
  if (item.customerNo.trim()) return `no:${item.customerNo.trim()}`;
  return `addr:${[item.company, item.street, item.city].map((v) => v.trim().toLowerCase()).join('|')}`;
}

function lineKey(line: Line) {
  return `${line.articleNo.trim().toLowerCase()}||${line.description.trim().toLowerCase()}`;
}

function analyzeHistory(orders: Order[]) {
  const sorted = [...orders].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
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
      if (!lk || lk === '||') return;
      const label = line.description || line.articleNo;
      if (normalizeNumber(line.quantity) > 0 || normalizeNumber(line.unitPrice) > 0) hasAnySale = true;
      if (seen.has(lk)) repeatProducts.push(label);
      else {
        firstProducts.push(label);
        seen.add(lk);
      }
    });

    let displayType = 'Verkauf';
    if (order.orderType === 'lieferschein') displayType = 'Lieferschein';
    else if (!hasAnySale && firstProducts.length && !repeatProducts.length) displayType = 'Demo';

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
      if (!key || key === '||') return;
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
    const info = history.get(order.id) || { firstProducts: [], repeatProducts: [], hasDemo: false, hasAnySale: false, displayType: 'Verkauf' };
    const hasLines = order.lines.some(lineFilled);
    return {
      id: order.id,
      no: idx + 1,
      date: order.date,
      code: reportCode(order),
      nameAddress: [order.company, [order.street, [order.zip, order.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join('\n'),
      productRepeat: info.repeatProducts.join(', '),
      productFirst: info.firstProducts.join(', '),
      amount: orderTotal(order),
      comment:
        order.dailyComment ||
        (info.hasDemo && info.repeatProducts.length > 0
          ? 'Nachbestellung und Demo'
          : info.hasDemo && info.hasAnySale
            ? 'Erstbestellung mit Demo'
            : info.hasDemo
              ? 'Demo'
              : hasLines
                ? 'Nachbestellung ohne Demo'
                : 'Kunde ohne Demo'),
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
        .map(([date, dayOrders]) => ({ date, orders: [...dayOrders].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) })),
    }));
}

function monthLabel(month: string) {
  const [year, mon] = month.split('-');
  return `${mon}.${year}`;
}

function dayLabel(date: string) {
  const [year, mon, day] = date.split('-');
  return `${day}.${mon}.${year}`;
}

function openDbConnection(): Promise<IDBDatabase> {
  return openDb();
}

async function dbPut(storeName: string, value: unknown) {
  const db = await openDbConnection();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
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
  const db = await openDbConnection();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => closeTrackedDb(db);
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDbConnection();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => closeTrackedDb(db);
  });
}

async function dbDelete(storeName: string, key: string) {
  const db = await openDbConnection();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
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

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 140;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, [value]);

  const point = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const source = 'touches' in e ? e.touches[0] : e;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  };

  const start = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const finish = () => {
    drawing.current = false;
    if (!canvasRef.current) return;
    onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => onChange('');

  return (
    <div className="signature-box">
      <canvas ref={canvasRef} className="signature-canvas" onMouseDown={start} onMouseMove={move} onMouseUp={finish} onMouseLeave={finish} onTouchStart={start} onTouchMove={move} onTouchEnd={finish} />
      <Button type="button" variant="outline" onClick={clear}>Unterschrift löschen</Button>
    </div>
  );
}

export default function App() {
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<'auftrag' | 'tagesbericht' | 'kunden' | 'artikel' | 'archiv'>('auftrag');
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState('Bereit');
  const [order, setOrder] = useState<Order>(emptyOrder('', ''));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [generatedPdfs, setGeneratedPdfs] = useState<GeneratedPdf[]>([]);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [searchArticle, setSearchArticle] = useState('');
  const [searchArchive, setSearchArchive] = useState('');
  const [archiveTypeFilter, setArchiveTypeFilter] = useState<'alle' | 'auftrag' | 'lieferschein' | 'demo'>('alle');
  const [customerLookup, setCustomerLookup] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [articleSuggestionIndex, setArticleSuggestionIndex] = useState<number | null>(null);
  const [openArchiveMonths, setOpenArchiveMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!hasIndexedDb()) {
      setStatus('IndexedDB fehlt in dieser Umgebung');
      return;
    }
    runSelfTests();
    (async () => {
      const savedSettings = await dbGet<Settings & { id: string }>('settings', 'profile');
      const nextCustomers = await dbGetAll<Customer>('customers');
      const nextProducts = await dbGetAll<Product>('products');
      const nextOrders = await dbGetAll<Order>('orders');
      setCustomers(nextCustomers);
      setProducts(nextProducts);
      setOrders(nextOrders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
      if (savedSettings) {
        const next = {
          employeeName: savedSettings.employeeName || '',
          employeeEmail: savedSettings.employeeEmail || '',
          defaultRecipient: savedSettings.defaultRecipient || '',
          ccRecipient: savedSettings.ccRecipient || '',
          areaCode: savedSettings.areaCode || '',
        };
        setSettings(next);
        setOrder(emptyOrder(next.employeeName, next.areaCode));
      } else setSettingsOpen(true);
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
    const currentIsSaved = !order.id.startsWith('draft-') && orders.some((saved) => saved.id === order.id);
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
    () => customers.filter((c) => [c.customerNo, c.company, c.city, c.contactPerson, c.contactPhone, c.notes].join(' ').toLowerCase().includes(searchCustomer.toLowerCase())),
    [customers, searchCustomer],
  );

  const filteredProducts = useMemo(
    () => products.filter((p) => [p.articleNo, p.description].join(' ').toLowerCase().includes(searchArticle.toLowerCase())),
    [products, searchArticle],
  );

  const customerLookupResults = useMemo(() => {
    const needle = customerLookup.trim().toLowerCase();
    if (!needle) return customers.slice(0, 12);
    return customers.filter((c) => [c.customerNo, c.company, c.city, c.street, c.contactPerson].join(' ').toLowerCase().includes(needle)).slice(0, 12);
  }, [customers, customerLookup]);

  const filteredArchiveOrders = useMemo(() => {
    const needle = searchArchive.trim().toLowerCase();
    return orders.filter((saved) => {
      const matchesText = !needle || [saved.customerNo, saved.company, saved.city, saved.contactPerson, saved.date, saved.customerOrderNo].join(' ').toLowerCase().includes(needle);
      const type = (historyMap.get(saved.id)?.displayType || 'Verkauf').toLowerCase();
      const matchesType = archiveTypeFilter === 'alle' || (archiveTypeFilter === 'auftrag' ? type === 'verkauf' : type === archiveTypeFilter);
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
      const existing = map.get(key) || { label: saved.company || saved.customerNo || 'Ohne Kunde', amount: 0 };
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
        const existing = map.get(key) || { label: line.description || line.articleNo || 'Ohne Artikel', quantity: 0 };
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
      if (field === 'articleNo') {
        const found = products.find((p) => p.articleNo.trim().toLowerCase() === value.trim().toLowerCase());
        if (found) next[index] = { ...next[index], description: next[index].description || found.description, unitPrice: next[index].unitPrice || String(found.unitPrice) };
      }
      return { ...prev, lines: ensureRows(next) };
    });
  };

  const suggestionsForLine = (line: Line) => {
    const needle = [line.articleNo, line.description].join(' ').trim().toLowerCase();
    if (!needle) return [] as Product[];
    return products.filter((p) => [p.articleNo, p.description].join(' ').toLowerCase().includes(needle)).slice(0, 8);
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
    if (!current.company.trim()) return 'Firma fehlt';
    if (!current.date.trim()) return 'Datum fehlt';
    if (!current.lines.some(lineFilled) && !current.dailyComment.trim()) return 'Mindestens eine Position oder Kommentar ist nötig';
    return null;
  };

  const validateForSend = (current: Order) => {
    const base = validateForSave(current);
    if (base) return base;
    if (!current.signatureName.trim() && !current.signatureDataUrl) return 'Unterschrift oder Klarschrift fehlt';
    return null;
  };

  const saveSettings = async () => {
    await dbPut('settings', { id: 'profile', ...settings });
    setOrder((prev) => ({ ...prev, employee: settings.employeeName || prev.employee, area: settings.areaCode || prev.area }));
    setSettingsOpen(false);
    setStatus('Einrichtung gespeichert');
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
    setCustomerLookup(customer.company || customer.customerNo || '');
    setCustomerDropdownOpen(false);
    setStatus('Kundendaten ergänzt');
  };

  const saveCustomerFromOrder = async () => {
    if (!order.company.trim()) return null;
    const existing = findExistingCustomer(order, customers);
    const payload: Customer = {
      id: existing?.id || `customer-${Date.now()}`,
      customerNo: order.customerNo.trim() || existing?.customerNo || '',
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
    await dbPut('customers', payload);
    setCustomers(await dbGetAll<Customer>('customers'));
    setOrder((prev) => ({ ...prev, customerId: payload.id, customerNo: payload.customerNo }));
    return payload;
  };

  const learnProductsFromOrder = async () => {
    const learned = order.lines
      .filter((line) => line.articleNo.trim() && (line.description.trim() || line.unitPrice.trim()))
      .map((line) => ({ articleNo: line.articleNo.trim(), description: line.description.trim(), unitPrice: normalizeNumber(line.unitPrice), updatedAt: new Date().toISOString() } satisfies Product));
    for (const item of learned) await dbPut('products', item);
    setProducts(await dbGetAll<Product>('products'));
  };

  const saveCurrentOrder = async () => {
    const err = validateForSave(order);
    if (err) return setStatus(err);
    const savedCustomer = await saveCustomerFromOrder();
    await learnProductsFromOrder();
    const payload: Order = {
      ...order,
      customerId: savedCustomer?.id || order.customerId,
      id: order.id.startsWith('draft-') ? `order-${Date.now()}` : order.id,
      lines: ensureRows(order.lines),
      total: orderTotal(order),
      createdAt: order.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbPut('orders', payload);
    setOrders((await dbGetAll<Order>('orders')).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    setOrder(payload);
    setStatus('Auftrag gespeichert');
  };

  const deleteOrder = async (orderId: string) => {
    await dbDelete('orders', orderId);
    setOrders((await dbGetAll<Order>('orders')).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    setStatus('Eintrag gelöscht');
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
    setTab('auftrag');
    setStatus('Auftrag dupliziert');
  };

  const exportCurrentOrder = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('MOST Auftrag', 14, 18);
    doc.setFontSize(10);
    doc.text(`Datum: ${order.date}`, 14, 28);
    doc.text(`Firma: ${order.company}`, 14, 34);
    doc.text(`Kundennr.: ${order.customerNo || '-'}`, 14, 40);
    let y = 50;
    order.lines.filter(lineFilled).forEach((line) => {
      doc.text(`${line.articleNo} | ${line.description} | ${line.quantity} | ${money(lineTotal(line))}`, 14, y);
      y += 6;
    });
    doc.text(`Summe: ${money(orderTotal(order))}`, 14, y + 8);
    const blob = doc.output('blob');
    const name = `Most_Auftrag_${order.customerNo || 'ohne-kunde'}_${order.date}.pdf`;
    const url = URL.createObjectURL(blob);
    setGeneratedPdfs([{ id: `${Date.now()}`, name, url, createdAt: new Date().toISOString() }]);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setStatus('Einzel-PDF erzeugt');
  };

  const exportDailyReport = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('MOST Tagesbericht', 14, 18);
    let y = 30;
    todayRows.forEach((row) => {
      doc.setFontSize(10);
      doc.text(`${row.no}. ${row.nameAddress.replace(/\n/g, ' / ')} | ${row.productFirst || '-'} | ${row.productRepeat || '-'} | ${money(row.amount)}`, 14, y);
      y += 6;
    });
    doc.text(`Tagesumsatz: ${money(todayTotals.amount)}`, 14, y + 8);
    const blob = doc.output('blob');
    const name = `Most_Tagesbericht_${today()}.pdf`;
    const url = URL.createObjectURL(blob);
    setGeneratedPdfs((prev) => [...prev, { id: `${Date.now()}-report`, name, url, createdAt: new Date().toISOString() }]);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setStatus('Tagesbericht erzeugt');
  };

  const sendDailyBatch = async () => {
    const err = validateForSend(order);
    if (err) return setStatus(err);
    await exportCurrentOrder();
    await exportDailyReport();
    setStatus('PDFs erzeugt. Bitte per Mailprogramm versenden.');
  };

  const exportBackup = () => {
    const payload: BackupPayload = { version: DB_VERSION, exportedAt: new Date().toISOString(), settings, customers, products, orders };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `most_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup exportiert');
  };

  const importBackup = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as BackupPayload;
    await idbDeleteDatabase();
    await dbPut('settings', { id: 'profile', ...parsed.settings });
    for (const customer of parsed.customers) await dbPut('customers', customer);
    for (const product of parsed.products) await dbPut('products', product);
    for (const savedOrder of parsed.orders) await dbPut('orders', { ...savedOrder, lines: ensureRows(savedOrder.lines || []) });
    setSettings(parsed.settings);
    setCustomers(await dbGetAll<Customer>('customers'));
    setProducts(await dbGetAll<Product>('products'));
    setOrders((await dbGetAll<Order>('orders')).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    setOrder(emptyOrder(parsed.settings.employeeName, parsed.settings.areaCode));
    setStatus('Backup importiert');
  };

  const resetApp = async () => {
    await idbDeleteDatabase();
    setSettings(emptySettings);
    setCustomers([]);
    setProducts([]);
    setOrders([]);
    setOrder(emptyOrder('', ''));
    setStatus('App zurückgesetzt');
    setSettingsOpen(true);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src={MOST_LOGO} alt="Most Logo" className="logo" />
          <div>
            <h1>Most Außendienst App</h1>
            <p>Vite + React + TypeScript • Offline mit IndexedDB</p>
          </div>
        </div>
        <div className="status-box">
          <div>Status: <strong>{status}</strong></div>
          <div>Heute: <strong>{liveOrders.filter((o) => o.date === today()).length} Aufträge</strong></div>
        </div>
      </header>

      <nav className="tabs-row">
        {(['auftrag', 'tagesbericht', 'kunden', 'artikel', 'archiv'] as const).map((item) => (
          <button key={item} className={tab === item ? 'tab active' : 'tab'} onClick={() => setTab(item)}>{item}</button>
        ))}
      </nav>

      {tab === 'auftrag' && (
        <div className="grid-2">
          <section className="panel">
            <div className="panel-head">
              <h2>Auftragsformular</h2>
              <div className="button-row wrap">
                <button className="btn secondary" onClick={() => setOrder(emptyOrder(settings.employeeName, settings.areaCode))}><RotateCcw size={16} /> Neu</button>
                <button className="btn primary blue" onClick={saveCurrentOrder}><Save size={16} /> Speichern</button>
                <button className="btn secondary" onClick={exportCurrentOrder}><FileText size={16} /> PDF</button>
                <button className="btn primary" onClick={sendDailyBatch}><Mail size={16} /> Tagesversand</button>
              </div>
            </div>

            <div className="form-grid four">
              <label><span>Datum</span><input type="date" value={order.date} onChange={(e) => updateOrder('date', e.target.value)} /></label>
              <label><span>Mitarbeiter</span><input value={order.employee} onChange={(e) => updateOrder('employee', e.target.value)} /></label>
              <label><span>Gebiet</span><input value={order.area} onChange={(e) => updateOrder('area', e.target.value)} /></label>
              <label><span>Typ</span><select value={order.orderType} onChange={(e) => updateOrder('orderType', e.target.value as 'auftrag' | 'lieferschein')}><option value="auftrag">Auftrag</option><option value="lieferschein">Lieferschein</option></select></label>
            </div>

            <div className="checks">
              <label><input type="checkbox" checked={order.isFirstOrder} onChange={(e) => updateOrder('isFirstOrder', e.target.checked)} /> Neukunde</label>
              <label><input type="checkbox" checked={order.isFollowUp} onChange={(e) => updateOrder('isFollowUp', e.target.checked)} /> Wiederholungskunde</label>
              <label><input type="checkbox" checked={order.isPhonePost} onChange={(e) => updateOrder('isPhonePost', e.target.checked)} /> Telefon / Post</label>
            </div>

            <div className="grid-2">
              <div className="box">
                <div className="panel-head small"><h3>Kunde</h3><button className="btn secondary" onClick={saveCustomerFromOrder}><User size={16} /> Speichern</button></div>
                <label><span>Kunde suchen</span><input value={customerLookup} onChange={(e) => { setCustomerLookup(e.target.value); setCustomerDropdownOpen(true); }} onFocus={() => setCustomerDropdownOpen(true)} placeholder="Name, Ort oder Straße" /></label>
                {customerDropdownOpen && (
                  <div className="dropdown-list">
                    {customerLookupResults.map((c) => (
                      <button key={c.id} className="dropdown-item" onClick={() => applyCustomer(c)}>
                        <strong>{c.company || 'Ohne Firma'}</strong>
                        <span>{[c.customerNo || '-', c.city, c.street, c.contactPerson].filter(Boolean).join(' • ')}</span>
                      </button>
                    ))}
                  </div>
                )}
                <label><span>Kundennummer</span><input value={order.customerNo} onChange={(e) => updateOrder('customerNo', e.target.value)} /></label>
                <label><span>Kundenbestellnr.</span><input value={order.customerOrderNo} onChange={(e) => updateOrder('customerOrderNo', e.target.value)} /></label>
                <label><span>Firma</span><input value={order.company} onChange={(e) => updateOrder('company', e.target.value)} /></label>
                <label><span>Straße</span><input value={order.street} onChange={(e) => updateOrder('street', e.target.value)} /></label>
                <div className="form-grid two"><label><span>PLZ</span><input value={order.zip} onChange={(e) => updateOrder('zip', e.target.value)} /></label><label><span>Ort</span><input value={order.city} onChange={(e) => updateOrder('city', e.target.value)} /></label></div>
                <div className="form-grid two"><label><span>Telefon</span><input value={order.phone} onChange={(e) => updateOrder('phone', e.target.value)} /></label><label><span>Fax</span><input value={order.fax} onChange={(e) => updateOrder('fax', e.target.value)} /></label></div>
              </div>

              <div className="box">
                <h3>Zusatz</h3>
                <label><span>Kommission</span><input value={order.commission} onChange={(e) => updateOrder('commission', e.target.value)} /></label>
                <label><span>E-Mail Empfänger</span><input value={order.emailInvoice} onChange={(e) => updateOrder('emailInvoice', e.target.value)} /></label>
                <label><span>Ansprechpartner</span><input value={order.contactPerson} onChange={(e) => updateOrder('contactPerson', e.target.value)} /></label>
                <label><span>Ansprechpartner Telefon</span><input value={order.contactPhone} onChange={(e) => updateOrder('contactPhone', e.target.value)} /></label>
                <label><span>Trainer</span><input value={order.trainer} onChange={(e) => updateOrder('trainer', e.target.value)} /></label>
                <label><span>Lieferadresse</span><textarea rows={3} value={order.deliveryAddress} onChange={(e) => updateOrder('deliveryAddress', e.target.value)} /></label>
                <label><span>Vermerke</span><textarea rows={3} value={order.notes} onChange={(e) => updateOrder('notes', e.target.value)} /></label>
                <label><span>Tagesbericht Kommentar</span><textarea rows={3} value={order.dailyComment} onChange={(e) => updateOrder('dailyComment', e.target.value)} /></label>
              </div>
            </div>

            <div className="box">
              <h3>Artikel</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th></th><th>Pos.</th><th>Art.-Nr.</th><th>Menge</th><th>Warenbezeichnung</th><th>Einzelpreis</th><th>Gesamtpreis</th></tr></thead>
                  <tbody>
                    {order.lines.map((line, index) => (
                      <tr key={line.id}>
                        <td><button className="icon-btn" onClick={() => setOrder((prev) => ({ ...prev, lines: ensureRows(prev.lines.map((item, i) => (i === index ? emptyLine(i + 1) : item))) }))}><Trash2 size={14} /></button></td>
                        <td>{index + 1}</td>
                        <td>
                          <div className="suggest-wrap">
                            <input value={line.articleNo} onChange={(e) => updateLine(index, 'articleNo', e.target.value)} onFocus={() => setArticleSuggestionIndex(index)} onBlur={() => setTimeout(() => setArticleSuggestionIndex((prev) => (prev === index ? null : prev)), 150)} />
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
                        <td><input value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} /></td>
                        <td><input value={line.description} onChange={(e) => updateLine(index, 'description', e.target.value)} /></td>
                        <td><input value={line.unitPrice} onChange={(e) => updateLine(index, 'unitPrice', e.target.value)} /></td>
                        <td>{money(lineTotal(line))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="summary-line"><span>{Math.ceil(Math.max(order.lines.filter(lineFilled).length, 1) / DEFAULT_ROWS)} PDF-Seiten</span><strong>Summe {money(currentTotal)}</strong></div>
            </div>

            <div className="grid-2">
              <div className="box"><h3>Unterschrift</h3><SignaturePad value={order.signatureDataUrl} onChange={(v) => updateOrder('signatureDataUrl', v)} /></div>
              <div className="box"><label><span>Klarschrift</span><input value={order.signatureName} onChange={(e) => updateOrder('signatureName', e.target.value)} /></label></div>
            </div>
          </section>

          <aside className="side-stack">
            <section className="panel compact"><h3>Heute</h3><div className="metric"><span>Heutige Aufträge</span><strong>{liveOrders.filter((o) => o.date === today()).length}</strong></div><div className="metric"><span>Tagesumsatz</span><strong>{money(todayTotals.amount)}</strong></div><div className="metric"><span>Monatsumsatz</span><strong>{money(monthTotals.amount)}</strong></div><button className="btn primary full" onClick={() => setSettingsOpen(true)}><FolderOpen size={16} /> Einrichtung</button></section>
            <section className="panel compact"><h3>Erzeugte PDFs</h3>{generatedPdfs.length ? generatedPdfs.map((item) => (<div key={item.id} className="pdf-card"><strong>{item.name}</strong><div className="button-row"><button className="btn secondary" onClick={() => window.open(item.url, '_blank')}>Öffnen</button><button className="btn secondary" onClick={() => downloadGeneratedPdf(item)}>Download</button><button className="btn secondary" onClick={() => shareGeneratedPdf(item)}>Teilen</button></div></div>)) : <p>Noch keine PDFs erzeugt.</p>}</section>
            <section className="panel compact"><h3>Kennzahlen</h3><div className="sublist"><strong>Top Kunden</strong>{dashboardTopCustomers.map((item, idx) => <div key={idx} className="row-between"><span>{item.label}</span><span>{money(item.amount)}</span></div>)}</div><div className="sublist"><strong>Top Artikel</strong>{dashboardTopProducts.map((item, idx) => <div key={idx} className="row-between"><span>{item.label}</span><span>{item.quantity}</span></div>)}</div></section>
          </aside>
        </div>
      )}

      {tab === 'tagesbericht' && (
        <section className="panel">
          <div className="panel-head"><h2>Tagesbericht</h2><div className="button-row"><span className="pill">Heute {today()}</span><span className="pill">Heute {todayRows.length} Zeilen</span><span className="pill">Monat {currentMonth()}</span></div></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th></th><th>Nr.</th><th>Cod.</th><th>Name und Adresse</th><th>Nachbestellung</th><th>Erstbestellung / Demo</th><th>Summe</th><th>Kommentar</th></tr></thead>
              <tbody>
                {todayRows.map((row) => (
                  <tr key={row.id}>
                    <td><button className="icon-btn" onClick={() => deleteOrder(row.id)}><Trash2 size={14} /></button></td>
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
          <div className="grid-2"><div className="box"><h3>Tagesergebnis</h3><div className="row-between"><span>Besuche</span><strong>{todayTotals.visits}</strong></div><div className="row-between"><span>Demos</span><strong>{todayTotals.demos}</strong></div><div className="row-between"><span>Verkäufe</span><strong>{todayTotals.sales}</strong></div><div className="row-between"><span>Summe</span><strong>{money(todayTotals.amount)}</strong></div></div><div className="box"><h3>Monatsergebnis</h3><div className="row-between"><span>Besuche</span><strong>{monthTotals.visits}</strong></div><div className="row-between"><span>Demos</span><strong>{monthTotals.demos}</strong></div><div className="row-between"><span>Verkäufe</span><strong>{monthTotals.sales}</strong></div><div className="row-between"><span>Summe</span><strong>{money(monthTotals.amount)}</strong></div></div></div>
        </section>
      )}

      {tab === 'kunden' && (
        <section className="panel">
          <div className="panel-head"><h2>Kunden</h2><input className="search" value={searchCustomer} onChange={(e) => setSearchCustomer(e.target.value)} placeholder="Kunde suchen" /></div>
          <div className="table-wrap tall">
            <table className="data-table">
              <thead><tr><th>Kundennr.</th><th>Firma</th><th>Ort</th><th>Ansprechpartner</th><th>AP Telefon</th><th>E-Mail</th><th>Vermerke</th></tr></thead>
              <tbody>{filteredCustomers.map((c) => (<tr key={c.id} className="clickable" onClick={() => setSelectedCustomer(c)}><td>{c.customerNo || '-'}</td><td>{c.company}</td><td>{[c.zip, c.city].filter(Boolean).join(' ')}</td><td>{c.contactPerson || '-'}</td><td>{c.contactPhone || '-'}</td><td>{c.emailInvoice}</td><td>{c.notes || '-'}</td></tr>))}</tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'artikel' && (
        <section className="panel">
          <div className="panel-head"><h2>Artikel</h2><input className="search" value={searchArticle} onChange={(e) => setSearchArticle(e.target.value)} placeholder="Artikel suchen" /></div>
          <div className="table-wrap tall"><table className="data-table"><thead><tr><th>Art.-Nr.</th><th>Warenbezeichnung</th><th>Einzelpreis</th></tr></thead><tbody>{filteredProducts.map((p) => (<tr key={p.articleNo}><td>{p.articleNo}</td><td>{p.description}</td><td>{money(p.unitPrice)}</td></tr>))}</tbody></table></div>
        </section>
      )}

      {tab === 'archiv' && (
        <section className="panel">
          <div className="panel-head"><h2>Archiv</h2><div className="button-row wrap"><input className="search" value={searchArchive} onChange={(e) => setSearchArchive(e.target.value)} placeholder="Archiv durchsuchen" /><select value={archiveTypeFilter} onChange={(e) => setArchiveTypeFilter(e.target.value as 'alle' | 'auftrag' | 'lieferschein' | 'demo')}><option value="alle">Alle Typen</option><option value="auftrag">Auftrag</option><option value="lieferschein">Lieferschein</option><option value="demo">Demo</option></select></div></div>
          <div className="stack">
            {groupedArchive.map((monthGroup, monthIndex) => {
              const isOpen = openArchiveMonths[monthGroup.month] ?? monthIndex === 0;
              return (
                <div key={monthGroup.month} className="archive-group">
                  <button className="archive-head" onClick={() => setOpenArchiveMonths((prev) => ({ ...prev, [monthGroup.month]: !isOpen }))}>
                    <div><strong>{monthLabel(monthGroup.month)}</strong><span>{monthGroup.days.reduce((sum, day) => sum + day.orders.length, 0)} Aufträge</span></div>
                    <span>{isOpen ? 'Einklappen' : 'Aufklappen'}</span>
                  </button>
                  {isOpen && monthGroup.days.map((dayGroup) => (
                    <div key={dayGroup.date} className="archive-day">
                      <div className="archive-day-label">{dayLabel(dayGroup.date)}</div>
                      <div className="archive-cards">
                        {dayGroup.orders.map((saved) => (
                          <div key={saved.id} className="archive-card">
                            <strong>{saved.company || 'Ohne Firma'}</strong>
                            <span>{saved.date} • {saved.customerNo || '-'} • {historyMap.get(saved.id)?.displayType || 'Verkauf'}</span>
                            <span>{money(saved.total || orderTotal(saved))}</span>
                            <div className="button-row wrap">
                              <button className="btn secondary" onClick={() => { setOrder({ ...saved, lines: ensureRows(saved.lines || []) }); setTab('auftrag'); }}>Laden</button>
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
            <div className="panel-head"><h2>{selectedCustomer.company || 'Kundendetails'}</h2><button className="btn secondary" onClick={() => setSelectedCustomer(null)}>Schließen</button></div>
            <div className="grid-2">
              <div className="box">
                <h3>Stammdaten</h3>
                <div className="info-list">
                  <div><strong>Kundennr.:</strong> {selectedCustomer.customerNo || '-'}</div>
                  <div><strong>Firma:</strong> {selectedCustomer.company || '-'}</div>
                  <div><strong>Adresse:</strong> {[selectedCustomer.street, [selectedCustomer.zip, selectedCustomer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '-'}</div>
                  <div><strong>Telefon:</strong> {selectedCustomer.phone || '-'}</div>
                  <div><strong>Fax:</strong> {selectedCustomer.fax || '-'}</div>
                  <div><strong>E-Mail:</strong> {selectedCustomer.emailInvoice || '-'}</div>
                  <div><strong>Ansprechpartner:</strong> {selectedCustomer.contactPerson || '-'}</div>
                  <div><strong>AP Telefon:</strong> {selectedCustomer.contactPhone || '-'}</div>
                  <div><strong>Lieferadresse:</strong> {selectedCustomer.deliveryAddress || '-'}</div>
                  <div><strong>Vermerke:</strong> {selectedCustomer.notes || '-'}</div>
                </div>
                <div className="grid-2"><div className="box"><span>Bisherige Aufträge</span><strong>{selectedCustomerTotals.orders}</strong></div><div className="box"><span>Gesamtumsatz</span><strong>{money(selectedCustomerTotals.amount)}</strong></div></div>
              </div>
              <div className="box">
                <h3>Gekaufte Artikel gesamt</h3>
                <div className="table-wrap small"><table className="data-table"><thead><tr><th>Art.-Nr.</th><th>Bezeichnung</th><th>Menge</th><th>Umsatz</th><th>Verkäufe</th><th>Demos</th></tr></thead><tbody>{selectedCustomerProducts.map((item) => (<tr key={item.key}><td>{item.articleNo || '-'}</td><td>{item.description || '-'}</td><td>{item.quantity}</td><td>{money(item.amount)}</td><td>{item.orders}</td><td>{item.demos}</td></tr>))}</tbody></table></div>
                <h3>Bisherige Aufträge</h3>
                <div className="table-wrap small"><table className="data-table"><thead><tr><th>Datum</th><th>Typ</th><th>Summe</th><th>Mitarbeiter</th><th>Kommentar</th></tr></thead><tbody>{selectedCustomerOrders.map((savedOrder) => (<tr key={savedOrder.id}><td>{savedOrder.date}</td><td>{selectedCustomerHistory.get(savedOrder.id)?.displayType || 'Verkauf'}</td><td>{money(savedOrder.total || orderTotal(savedOrder))}</td><td>{savedOrder.employee || '-'}</td><td>{savedOrder.dailyComment || savedOrder.notes || '-'}</td></tr>))}</tbody></table></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Einrichtung</h2>
            <div className="stack">
              <label><span>Mitarbeitername</span><input value={settings.employeeName} onChange={(e) => setSettings((s) => ({ ...s, employeeName: e.target.value }))} /></label>
              <label><span>Mitarbeiter E-Mail</span><input value={settings.employeeEmail} onChange={(e) => setSettings((s) => ({ ...s, employeeEmail: e.target.value }))} /></label>
              <label><span>Gebietsnummer</span><input value={settings.areaCode} onChange={(e) => setSettings((s) => ({ ...s, areaCode: e.target.value }))} /></label>
              <label><span>Empfänger E-Mail</span><input value={settings.defaultRecipient} onChange={(e) => setSettings((s) => ({ ...s, defaultRecipient: e.target.value }))} /></label>
              <label><span>CC / weiterer Empfänger</span><input value={settings.ccRecipient} onChange={(e) => setSettings((s) => ({ ...s, ccRecipient: e.target.value }))} /></label>
              <div className="button-row wrap">
                <button className="btn secondary" onClick={exportBackup}><Download size={16} /> Backup exportieren</button>
                <button className="btn secondary" onClick={() => importFileRef.current?.click()}><Upload size={16} /> Backup importieren</button>
                <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void importBackup(file); e.currentTarget.value = ''; }} />
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
