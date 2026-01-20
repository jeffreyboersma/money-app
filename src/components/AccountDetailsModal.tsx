'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, RotateCcw, Download } from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  Label,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Transaction {
  transaction_id: string;
  date: string;
  name: string;
  amount: number;
  category: string[];
  logo_url?: string | null;
  personal_finance_category_icon_url?: string | null;
  personal_finance_category?: {
    primary: string;
    detailed: string;
    confidence_level: string;
  } | null;
}

type TimeRange = '1D' | '1W' | '30D' | '3M' | '6M' | '1Y' | '2Y' | 'YTD' | 'MAX' | 'CUSTOM';

interface AccountData {
  account: {
    account_id: string;
    name: string;
    official_name: string | null;
    type: string;
    subtype: string;
    mask: string;
    balances: {
      current: number;
      available: number | null;
      limit: number | null;
      iso_currency_code: string;
    };
  };
  transactions: Transaction[];
  total_transactions: number;
  earliest_transaction_date?: string | null;
}

interface BalanceHistoryPoint {
  date: string;
  balance: number;
}

interface AccountDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  accessTokens: string[];
  institutionName?: string;
  institutionLogo?: string;
}

const getDisplayCategory = (tx: Transaction): string | null => {
  if (!tx.personal_finance_category) return null;
  
  const { primary, detailed } = tx.personal_finance_category;
  
  // Custom mappings requested by user
  if (detailed.includes('GROCERIES')) return 'Groceries';
  if (detailed.includes('RESTAURANT')) return 'Restaurant';
  if (detailed.includes('FAST_FOOD')) return 'Fast Food';
  if (detailed.includes('COFFEE')) return 'Coffee';
  if (detailed.includes('BEER_WINE_AND_LIQUOR')) return 'Alcohol';
  if (detailed.includes('TRANSPORTATION_GAS')) return 'Gas';
  if (detailed.includes('TRANSPORTATION_PARKING')) return 'Parking';
  if (detailed.includes('TRANSPORTATION_PUBLIC_TRANSIT')) return 'Public Transit';
  if (detailed.includes('TRANSPORTATION_TOLLS')) return 'Tolls';
  if (detailed.includes('INTERNET_AND_CABLE')) return 'Internet & Cable';
  if (detailed.includes('GAS_AND_ELECTRICITY')) return 'Gas & Electricity';
  if (detailed.includes('RENT_AND_UTILITIES_WATER')) return 'Water';
  if (detailed.includes('RENT_AND_UTILITIES_TELEPHONE')) return 'Phone';
  if (detailed.includes('HOME_IMPROVEMENT_HARDWARE')) return 'Hardware';
  
  return primary
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const CustomTooltip = (props: any) => {
  const { active, payload, label, coordinate, viewBox, topMargin = 40, bottomMargin = 40 } = props;

  if (active && payload && payload.length && coordinate) {
    const value = payload[0].value;
    const date = new Date(label + 'T00:00:00');
    
    // Format: "JANUARY 17, 2026"
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase();

    // Format: "-$123.45" or "$123.45"
    const isNegative = value < 0;
    const formattedValue = `${isNegative ? '-' : ''}$${Math.abs(value).toFixed(2)}`;

    // Get chart dimensions with fallbacks
    // viewBox is usually present in Cartesian charts, providing { x, y, width, height }
    // If undefined, try explicit width/height props, or fallback to sensible defaults based on container
    const height = viewBox?.height || props.height || 300; 
    const width = viewBox?.width || props.width || 0;
    const { x } = coordinate;

    const labelStyle: React.CSSProperties = { left: x };
    const labelClass = "absolute -translate-x-1/2 flex flex-col items-center";

    return (
      <div className="relative pointer-events-none" style={{ width: width || '100%', height: height }}>
        {/* Top Label (Balance) - placed in the top margin area */}
        <div 
          className={labelClass}
          style={{ ...labelStyle, top: 0 }} // Fixed distance from top of container
        >
          <div>
            <span className="text-lg font-bold tracking-tight">{formattedValue}</span>
          </div>
        </div>

        {/* Bottom Label (Date) - placed in the bottom margin area */}
        <div 
          className={labelClass}
          style={{ ...labelStyle, bottom: 0 }} // Fixed distance from bottom of container
        >
          <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase whitespace-nowrap">
             {formattedDate}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="rounded-lg border bg-popover p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div 
            className="h-2 w-2 rounded-full" 
            style={{ backgroundColor: data.payload.fill }}
          />
          <span className="text-sm font-medium text-foreground">
            {data.name}
          </span>
        </div>
        <div className="mt-1 text-2xl font-bold text-foreground">
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
          }).format(data.value)}
        </div>
      </div>
    );
  }
  return null;
};

const formatDateToLocalYMD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function AccountDetailsModal({ 
  isOpen, 
  onClose, 
  accountId, 
  accessTokens,
  institutionName,
  institutionLogo 
}: AccountDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountData | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryPoint[]>([]);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('30D');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateToLocalYMD(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => formatDateToLocalYMD(new Date()));
  const [dateError, setDateError] = useState<string | null>(null);
  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [earliestKnownDate, setEarliestKnownDate] = useState<string | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const getDateRange = (range: TimeRange) => {
    const end = new Date();
    const start = new Date();

    if (range === 'CUSTOM') {
      const s = new Date(customStart);
      s.setHours(0, 0, 0, 0); // Start of day local time
      // Adjust simply to avoid timezone issues with pure date strings if needed
      // But new Date('YYYY-MM-DD') is UTC. new Date('YYYY-MM-DDT00:00:00') is local.
      // Let's ensure we use local logical date construction
      const [sY, sM, sD] = customStart.split('-').map(Number);
      start.setFullYear(sY, sM - 1, sD);
      start.setHours(0, 0, 0, 0);

      const [eY, eM, eD] = customEnd.split('-').map(Number);
      end.setFullYear(eY, eM - 1, eD);
      end.setHours(23, 59, 59, 999);
      
      return { start, end };
    }

    switch (range) {
      case '1D':
        start.setDate(end.getDate() - 1);
        break;
      case '1W':
        start.setDate(end.getDate() - 7);
        break;
      case '30D':
        start.setDate(end.getDate() - 30);
        break;
      case '3M':
        start.setMonth(end.getMonth() - 3);
        break;
      case '6M':
        start.setMonth(end.getMonth() - 6);
        break;
      case '1Y':
        start.setFullYear(end.getFullYear() - 1);
        break;
      case '2Y':
        start.setFullYear(end.getFullYear() - 2);
        break;
      case 'YTD':
        start.setMonth(0, 1);
        break;
      case 'MAX':
        start.setFullYear(end.getFullYear() - 10);
        break;
    }
    return { start, end };
  };

  // Reset date range when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedRange('30D');
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setCustomStart(formatDateToLocalYMD(d));
      setCustomEnd(formatDateToLocalYMD(new Date()));
      setDateError(null);
      setDateWarning(null);
      setData(null);
      setBalanceHistory([]);
      setEarliestKnownDate(null);
    }
  }, [isOpen]);

  // Warning for custom date selection relative to earliest known data
  useEffect(() => {
    if (selectedRange === 'CUSTOM' && earliestKnownDate) {
      if (customStart < earliestKnownDate) {
        const d = new Date(earliestKnownDate + 'T00:00:00');
        const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        setDateWarning(`Transactions only available starting from ${formatted}`);
      } else {
        setDateWarning(null);
      }
    } else {
      setDateWarning(null);
    }
  }, [selectedRange, customStart, earliestKnownDate]);

  // Reset state when modal opens/closes or account changes
  useEffect(() => {
    if (isOpen && accountId) {
      if (data?.account.account_id !== accountId) {
        setEarliestKnownDate(null);
      }

      if (selectedRange === 'CUSTOM') {
        if (customStart > customEnd) {
          setDateError('Start date cannot be after end date');
          return;
        }
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        if (customStart > today || customEnd > today) {
          setDateError('Dates cannot be in the future');
          return;
        }
        setDateError(null);
      } else {
        setDateError(null);
      }

      setLoading(true);
      setError(null);
      // Only clear data if the account ID has changed to allow for smooth transitions when changing date ranges
      setData((prev) => (prev?.account.account_id === accountId ? prev : null));
      fetchData();
    }
  }, [isOpen, accountId, selectedRange, customStart, customEnd]);

  async function fetchData() {
    if (!accountId) return;
    
    try {
      if (!accessTokens || accessTokens.length === 0) {
        throw new Error('No access tokens available.');
      }

      const { start, end } = getDateRange(selectedRange);

      const response = await fetch('/api/get_account_details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_tokens: accessTokens,
          account_id: accountId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          include_earliest_date: earliestKnownDate === null, // Only ask if we don't know it
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch account details');
      }

      const result = await response.json();

      // Fix for automatic payment transactions on credit cards being treated as money out (positive amount)
      // when they should be money in (negative amount, reducing liability).
      if (result.account && (result.account.type === 'credit' || result.account.subtype === 'credit card')) {
        result.transactions = result.transactions.map((tx: Transaction) => {
           if (tx.amount > 0 && tx.name.toLowerCase().includes('automatic payment') || tx.name.toLowerCase().includes('payment - thank')) {
             return { ...tx, amount: -tx.amount };
           }
           return tx;
        });
      }

      setData(result);
      
      // Update earliest known date from API if provided
      if (result.earliest_transaction_date) {
        setEarliestKnownDate(result.earliest_transaction_date);
      } else {
        // Fallback logic if API didn't return it (e.g. legacy or not requested)
        // Determine if we found the start of history
        // Logic: If we requested a range, and we got ALL transactions in that range (fetched < limit? or fetched == total existent)
      // AND the oldest transaction is significantly later than requested start date,
      // OR we just assume oldest transaction IS the start if total_transactions matches length.
      
      // Plaid returns total_transactions for the requested range.
      // If transactions.length === result.total_transactions, we have everything in the window [start, end].
      // If result.total_transactions is small?
      
      const hasAllInWindow = result.transactions.length >= result.total_transactions;
      
      if (hasAllInWindow && result.transactions.length > 0) {
          // Sort to find oldest in this batch
          const sorted = [...result.transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const oldestTx = sorted[0];
          const oldestDate = new Date(oldestTx.date);
          oldestDate.setHours(0,0,0,0);
          
          const requestedStart = new Date(start);
          requestedStart.setHours(0,0,0,0);

          // If oldest transaction is after requested start (plus margin), 
          // or if we are in 'MAX' mode which is huge.
          // Let's use a 7 day margin to be safe against dormant periods?
          // Or just trust it. If I ask for 30 days, and I get 5 transactions, and oldest is 10 days ago.
          // It means days 11-30 had no transactions.
          // Does it mean history starts 10 days ago? Not necessarily. Could be dormant.
          
          // However, if we view a LARGE range, we are more confident.
          // But user wants to disable ranges > 3M.
          
          // Better logic: Only update "known start date" if we are confident.
          // If we haven't found a start date yet...
          // Maybe we don't need to be perfect.
          // If we encounter a transaction at date X. We know history goes AT LEAST to X.
          // This doesn't help with disabling "older" ranges.
          
          // We need "History definitely does NOT go older than X".
          // This happens if query [Start, End] returns transactions, and `total_transactions` indicates we got them all.
          // AND `Start` is old enough that we EXPECTED more if account was older?
          
          // If I query 2 years. I get all transactions. Oldest is 1 year ago.
          // Then start is 1 year ago.
          
          // If I query 30 days. I get all transactions. Oldest is 5 days ago.
          // Start might be 5 days ago, or 5 years ago.
          
          // So we should only set `earliestKnownDate` if `range > 30D`?
          // Or if `selectedRange` is large?
          
          if (['6M', '1Y', '2Y', 'YTD', 'MAX'].includes(selectedRange)) {
             // We can be reasonably sure that the oldest transaction here is the start of history,
             // OR that there is a gap of at least (Oldest - Start) with no transactions.
             // If the gap is substantial, we can treat it as start.
             
             // Let's just set it to the oldest transaction found IF we have the full window.
             // Because even if account is older, if there are no transactions for 6 months, 
             // effectively the history for chart purposes starts there.
             
             // Update only if older than current known? No, we want to find the BOUNDARY.
             // We want the *most restrictive* (latest) date that represents the start.
             // Actually no, we want the *earliest* date.
             // If we found a transaction in 2020. Earliest is 2020.
             // If we found a transaction in 2024. Earliest is 2024? No 2020 exists.
             
             // Wait. `earliestKnownDate` should be the date of the First Ever Transaction.
             // If we find a transaction at T1. The First Ever is <= T1.
             // This doesn't help us DISABLE T0 (where T0 < T1).
             
             // We need to know: There are NO transactions before T1.
             // This corresponds to: Query(T_ancient, T_now) returns oldest=T1.
             // We queried [start, end].
             // If `start` is before `oldestTx`, and we have all txs in [start, end].
             // Then NO transactions exist in [start, oldestTx).
             
             const OneDay = 24 * 60 * 60 * 1000;
             if (oldestDate.getTime() > requestedStart.getTime() + OneDay) {
                 // There is a gap at the start of the window.
                 // So oldestDate is effectively the start of history (or start of active history).
                 setEarliestKnownDate(oldestTx.date);
             }
          }
      }
    }
      
      calculateBalanceHistory(result.account.balances.current, result.transactions, result.earliest_transaction_date || earliestKnownDate || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const calculateBalanceHistory = (currentBalance: number, transactions: Transaction[], knownEarliestDate: string | null = null) => {
    // We expect transactions from 'now' back to at least startDate.
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const txMap: Record<string, number> = {};
    sortedTransactions.forEach(tx => {
        txMap[tx.date] = (txMap[tx.date] || 0) + tx.amount;
    });

    let earliestTxTime: number | null = null;
    if (sortedTransactions.length > 0) {
      const lastTx = sortedTransactions[sortedTransactions.length - 1];
      const [y, m, d] = lastTx.date.split('-').map(Number);
      earliestTxTime = new Date(y, m - 1, d).getTime();
    }

    // Determine the hard stop time based on known history
    let cutoffTime: number | null = null;
    if (knownEarliestDate) {
        const [y, m, d] = knownEarliestDate.split('-').map(Number);
        cutoffTime = new Date(y, m - 1, d).getTime();
    } else {
        cutoffTime = earliestTxTime;
    }

    let tempBalance = currentBalance;
    const historyPoints: BalanceHistoryPoint[] = [];
    
    // Determine the visualization range
    const { start, end } = getDateRange(selectedRange);
    
    // We iterate backwards from TODAY (because we know currentBalance at TODAY).
    // As we move backwards, we "undo" transactions to find previous balances.
    const loopDate = new Date(); // Start at "now"
    loopDate.setHours(0,0,0,0);
    
    const startDate = new Date(start);
    startDate.setHours(0,0,0,0);

    const endDate = new Date(end);
    endDate.setHours(0,0,0,0);

    // Limit iteration
    let safetyCounter = 0;
    const MAX_DAYS = 365 * 10; 

    // Loop until we go past the start date
    while (loopDate >= startDate && safetyCounter < MAX_DAYS) {
        if (cutoffTime !== null && loopDate.getTime() < cutoffTime) {
          break;
        }

        const dateStr = loopDate.toISOString().split('T')[0];

        // Only add to history if we are within the requested [start, end] window
        // (inclusive of start/end dates).
        if (loopDate <= endDate) {
            historyPoints.unshift({
                date: dateStr,
                balance: tempBalance
            });
        }

        // Before moving to previous day, undo transactions of the current loopDate
        // Undo means: if transaction was +amount, we subtract it to get *start of day* balance of loopDate? 
        // No. balance is usually "end of day".
        // If current balance is end of TODAY.
        // Transactions today happened.
        // To get balance at end of YESTERDAY, we SUBTRACT today's transactions.
        
        const change = txMap[dateStr] || 0;
        tempBalance += change; // Add change to go backwards (assuming Plaid convention: positive amount = expense)

        loopDate.setDate(loopDate.getDate() - 1);
        safetyCounter++;
    }

    setBalanceHistory(historyPoints);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  const chartColor = React.useMemo(() => {
    if (balanceHistory.length < 2) return '#9ca3af';
    const first = balanceHistory[0].balance;
    const last = balanceHistory[balanceHistory.length - 1].balance;
    if (last > first) return '#22c55e';
    if (last < first) return '#ef4444';
    return '#9ca3af';
  }, [balanceHistory]);

  const spendingData = React.useMemo(() => {
    if (!data || !data.transactions) return [];

    const { start, end } = getDateRange(selectedRange);
    const toDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const startDateStr = toDateStr(start);
    const endDateStr = toDateStr(end);

    const categoryTotals: Record<string, number> = {};

    data.transactions.forEach(tx => {
        // Only count positive amounts (expenses) and within date range
        if (tx.date >= startDateStr && tx.date <= endDateStr && tx.amount > 0) {
            const category = getDisplayCategory(tx) || (tx.category ? tx.category[0] : 'Uncategorized');
            categoryTotals[category] = (categoryTotals[category] || 0) + tx.amount;
        }
    });

    const sortedCategories = Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value]) => ({ name, value }));

    // Group into top 5 + Other
    if (sortedCategories.length > 5) {
        const top5 = sortedCategories.slice(0, 5);
        const otherValue = sortedCategories.slice(5).reduce((sum, item) => sum + item.value, 0);
        if (otherValue > 0) {
            top5.push({ name: 'Other', value: otherValue });
        }
        return top5;
    }

    return sortedCategories;
  }, [data, selectedRange]);

  const totalSpending = React.useMemo(() => {
    return spendingData.reduce((acc, curr) => acc + curr.value, 0);
  }, [spendingData]);

  const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#64748b'];

  const handleExportCSV = () => {
    if (!data || !data.transactions) return;

    const { start, end } = getDateRange(selectedRange);
    const toDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const startDateStr = toDateStr(start);
    const endDateStr = toDateStr(end);

    const filteredTransactions = data.transactions.filter(tx => {
        return tx.date >= startDateStr && tx.date <= endDateStr;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (filteredTransactions.length === 0) return;

    const headers = ['Date', 'Name', 'Category', 'Amount', 'Currency'];
    const csvContent = [
        headers.join(','),
        ...filteredTransactions.map(tx => {
            const displayCat = getDisplayCategory(tx);
            const category = displayCat ? `"${displayCat}"` : (tx.category ? `"${tx.category.join(';')}"` : '');
            const name = `"${tx.name.replace(/"/g, '""')}"`;
            return [
                tx.date,
                name,
                category,
                tx.amount * -1,
                data.account.balances.iso_currency_code
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${startDateStr}_${endDateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportOFX = () => {
    if (!data || !data.transactions) return;

    const { start, end } = getDateRange(selectedRange);
    const toDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const startDateStr = toDateStr(start);
    const endDateStr = toDateStr(end);

    const filteredTransactions = data.transactions.filter(tx => {
        return tx.date >= startDateStr && tx.date <= endDateStr;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (filteredTransactions.length === 0) return;

    const formatOFXDate = (dateStr: string) => {
        return dateStr.replace(/-/g, '') + '000000';
    };

    const now = new Date();
    const serverDate = now.toISOString().split('T')[0].replace(/-/g, '') + 
                       now.toTimeString().split(' ')[0].replace(/:/g, '');

    const currency = data.account.balances.iso_currency_code || 'USD';
    const subtype = data.account.subtype.toLowerCase();
    const type = data.account.type.toLowerCase();
    const isCreditCard = type === 'credit' || subtype.includes('credit card');

    let acctType = 'CHECKING';
    if (subtype.includes('savings')) acctType = 'SAVINGS';
    else if (subtype.includes('money market')) acctType = 'MONEYMRKT';
    else if (isCreditCard) acctType = 'CREDITCARD';

    // OFX 1.0.2 constraints
    const cleanString = (str: string, maxLength: number) => {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, maxLength);
    };

    // Plaid account IDs can be long (37+ chars), but OFX usually limits ACCTID to 22 or 32 chars.
    // MS Money 2002 might be strict (e.g. 22 chars).
    // We'll take the simple approach of slicing the ID to ensure it fits.
    // Ideally we'd store a mapping properly, but this should work for import.
    const safeAccountId = data.account.account_id.replace(/^accessToken-/, '').slice(-22);

    let transactionsXml = '';
    filteredTransactions.forEach(tx => {
        const amount = (tx.amount * -1).toFixed(2);
        const trnType = parseFloat(amount) < 0 ? 'DEBIT' : 'CREDIT';
        const datePosted = formatOFXDate(tx.date);
        
        // SGML OFX 1.0.2 does not use closing tags for leaf elements
        transactionsXml += `
            <STMTTRN>
                <TRNTYPE>${trnType}
                <DTPOSTED>${datePosted}
                <TRNAMT>${amount}
                <FITID>${tx.transaction_id}
                <NAME>${cleanString(tx.name, 32)}
                ${tx.category ? `<MEMO>${cleanString(tx.category.join('; '), 255)}` : ''}
            </STMTTRN>`;
    });

    let balanceVal = data.account.balances.current;
    if (isCreditCard) {
        // For credit cards, positive balance usually means amount owed (debt).
        // OFX expects debt as negative for LEDGERBAL?
        // Actually, in OFX:
        // "Balances are signed relative to the account type. 
        // For a checking, savings, or money market account, a positive balance indicates an asset...
        // For a credit card... a positive balance indicates a liability (amount owed)."
        // Plaid: positive means liability for credit cards.
        // So for Credit Card, Plaid positive = OFX positive.
        // For Checking/Savings, Plaid positive = OFX positive.
        // Wait, earlier code had `balanceVal = -balanceVal` for credit cards.
        // Let's verify Plaid docs: "A positive balance indicates an outstanding balance (amount owed)."
        // OFX Spec 1.0.2 Section 11.2 Credit Card: "A positive amount indicates that the user owes money."
        // So if Plaid says 100 (owed), OFX says 100 (owed).
        // However, many Money/Quicken versions prefer negative for owing?
        // Let's stick to standard first. But the previous code flipped it.
        // Let's revert to NOT flipping it if standard matches, OR if user feedback implies it was wrong.
        // The user didn't complain about balance, just file corruption.
        // I will keep the reversal logic IF IT WAS NEEDED for 'standard' behavior in apps like Money.
        // Usually Money treats Credit Card positive balance as Owed.
        // Let's look at `TRNAMT`. 
        // Plaid: Expense is Positive.
        // OFX: Debit is Negative.
        // So I flip transactions: `amount = (tx.amount * -1)`. Correct.
        // If I spend $10, Plaid says +10. OFX says -10 (Debit).
        // Balance:
        // If I owe $100. Plaid says +100.
        // OFX says +100 (Owes).
        // BUT, `LEDGERBAL` in Money sometimes displays weirdly.
        // Let's stick to no-flip for balance unless I see specific docs for Money 2002.
        // Wait, checks logic I modified in previous turn: 
        // `if (isCreditCard) { balanceVal = -balanceVal; }`
        // I will keep this logic if it aligns with "available vs current" quirks, but strictly OFX spec says positive = liability.
        // Let's remove the flip to be Spec compliant, assuming Money 2002 follows spec.
        // If Plaid current = 100 (debt), OFX LEDGERBAL = 100.
        // (Removing the flip I added previously).
    }
    
    // Actually, let's keep the flip logic out unless I am sure. 
    // Wait, Plaid 'current' for depository is Asset (+).
    // Plaid 'current' for credit is Liability (+).
    // OFX 'LEDGERBAL' for Check is Asset (+).
    // OFX 'LEDGERBAL' for Credit is Liability (+).
    // So direct mapping should be correct.
    // EXCEPT: My previous code did: `if (isCreditCard) { balanceVal = -balanceVal; }`
    // I will remove that flip now as it seems wrong per spec.

    const bankTranList = `
                    <BANKTRANLIST>
                        <DTSTART>${formatOFXDate(startDateStr)}
                        <DTEND>${formatOFXDate(endDateStr)}
                        ${transactionsXml}
                    </BANKTRANLIST>`;

    const ledgerBal = `
                    <LEDGERBAL>
                        <BALAMT>${balanceVal.toFixed(2)}
                        <DTASOF>${serverDate}
                    </LEDGERBAL>`;

    let msgSet = '';

    if (isCreditCard) {
        msgSet = `
        <CREDITCARDMSGSRSV1>
            <CCSTMTTRNRS>
                <TRNUID>1
                <STATUS>
                    <CODE>0
                    <SEVERITY>INFO
                </STATUS>
                <CCSTMTRS>
                    <CURDEF>${currency}
                    <CCACCTFROM>
                        <ACCTID>${safeAccountId}
                    </CCACCTFROM>
                    ${bankTranList}
                    ${ledgerBal}
                </CCSTMTRS>
            </CCSTMTTRNRS>
        </CREDITCARDMSGSRSV1>`;
    } else {
        msgSet = `
        <BANKMSGSRSV1>
            <STMTTRNRS>
                <TRNUID>1
                <STATUS>
                    <CODE>0
                    <SEVERITY>INFO
                </STATUS>
                <STMTRS>
                    <CURDEF>${currency}
                    <BANKACCTFROM>
                        <BANKID>000000000
                        <ACCTID>${safeAccountId}
                        <ACCTTYPE>${acctType}
                    </BANKACCTFROM>
                    ${bankTranList}
                    ${ledgerBal}
                </STMTRS>
            </STMTTRNRS>
        </BANKMSGSRSV1>`;
    }

    const ofxContent = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
    <SIGNONMSGSRSV1>
        <SONRS>
            <STATUS>
                <CODE>0
                <SEVERITY>INFO
            </STATUS>
            <DTSERVER>${serverDate}
            <LANGUAGE>ENG
        </SONRS>
    </SIGNONMSGSRSV1>
    ${msgSet}
</OFX>`;

    const blob = new Blob([ofxContent], { type: 'text/ofx' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${startDateStr}_${endDateStr}.ofx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-background rounded-lg shadow-xl border"
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 pl-6 border-b bg-background/95 backdrop-blursupports-[backdrop-filter]:bg-background/60">
            <div>
                 {data ? (
                    <>
                        <h2 className="text-xl font-bold pb-2">{data.account.name}</h2>
                        <p className="text-sm text-muted-foreground">{data.account.type.toUpperCase()} • {data.account.subtype.toUpperCase()} • {data.account.mask}</p>
                    </>
                 ) : (
                    <h2 className="text-xl font-bold">Account Details</h2>
                 )}
            </div>
            <div className="flex items-center gap-4">
                {(institutionName || institutionLogo) && (
                    <div className="flex items-center gap-3 border-r pr-8">
                        {institutionLogo && (
                             <div className="w-8 h-8 flex items-center justify-center">
                                <img
                                    src={`data:image/png;base64,${institutionLogo}`}
                                    alt={institutionName || 'Institution'}
                                    className="max-w-full max-h-full object-contain"
                                />
                            </div>
                        )}
                        {institutionName && (
                            <span className="text-sm font-medium text-muted-foreground">
                                {institutionName}
                            </span>
                        )}
                    </div>
                )}
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-5 w-5" />
                </Button>
            </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-4">
              <p>{error}</p>
              <Button variant="outline" onClick={fetchData}>Retry</Button>
            </div>
          )}

          {!error && (
            <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="text-3xl font-bold text-primary min-h-[40px] flex items-center">
                        {data ? (
                            formatCurrency(data.account.balances.current, data.account.balances.iso_currency_code)
                        ) : (
                            loading && <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-wrap items-center bg-card p-1 rounded-lg border gap-0.5">
                          {(['1D', '1W', '30D', '3M', '6M', '1Y', '2Y', 'YTD', 'MAX', 'CUSTOM'] as const).map((r) => {
                            let isDisabled = false;
                            // Only apply logic for ranges > 3M (and exclude MAX/CUSTOM)
                            if (earliestKnownDate && ['6M', '1Y', '2Y', 'YTD'].includes(r)) {
                                const { start } = getDateRange(r);
                                const earliest = new Date(earliestKnownDate);
                                earliest.setHours(0,0,0,0);
                                start.setHours(0,0,0,0);
                                if (start < earliest) {
                                    isDisabled = true;
                                }
                            }

                            return (
                            <Button
                              key={r}
                              variant="ghost"
                              size="sm"
                              className={`h-7 px-2 text-xs hover:bg-background ${selectedRange === r ? 'bg-background border hover:bg-background text-foreground' : 'text-muted-foreground'}`}
                              onClick={() => setSelectedRange(r)}
                              disabled={(loading && !data) || isDisabled}
                            >
                              {r === 'CUSTOM' ? 'Custom' : r}
                            </Button>
                          );
                          })}
                        </div>

                        {selectedRange === 'CUSTOM' && (
                            <div className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="date" 
                                        value={customStart}
                                        onChange={(e) => setCustomStart(e.target.value)}
                                        className={`h-8 rounded-md border bg-card px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${dateError ? 'border-red-500 text-red-500 focus-visible:ring-red-500' : 'border-input'}`}
                                    />
                                    <span className="text-muted-foreground text-xs">to</span>
                                    <input 
                                        type="date" 
                                        value={customEnd}
                                        onChange={(e) => setCustomEnd(e.target.value)}
                                        className={`h-8 rounded-md border bg-card px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${dateError ? 'border-red-500 text-red-500 focus-visible:ring-red-500' : 'border-input'}`}
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                            const d = new Date();
                                            d.setDate(d.getDate() - 30);
                                            setCustomStart(formatDateToLocalYMD(d));
                                            setCustomEnd(formatDateToLocalYMD(new Date()));
                                        }}
                                        title="Reset to past 30 days"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>
                                </div>
                                {dateError && (
                                    <span className="text-xs text-red-500 font-medium">
                                        {dateError}
                                    </span>
                                )}
                                {!dateError && dateWarning && (
                                    <span className="text-xs text-amber-500 font-medium">
                                        {dateWarning}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            Balance History
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {selectedRange === 'CUSTOM' ? 'Custom' : selectedRange}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="relative">
                        {loading && (
                            <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center backdrop-blur-[1px] transition-all duration-200">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        )}
                        <div className="h-[300px] w-full">
                            {(data || balanceHistory.length > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart 
                                        data={balanceHistory}
                                        margin={{ top: 30, right: 0, left: 0, bottom: 20 }}
                                    >
                                        <defs>
                                            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" hide />
                                        <YAxis domain={['dataMin', 'dataMax']} hide />
                                        <Tooltip 
                                            content={<CustomTooltip topMargin={30} bottomMargin={20} />} 
                                            cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                                            position={{ x: 0, y: 0 }}
                                            isAnimationActive={false}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="balance" 
                                            stroke={chartColor} 
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorBalance)"
                                            activeDot={{ r: 4, fill: chartColor, strokeWidth: 0 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                !loading && (
                                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                        No data available
                                    </div>
                                )
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            Spending Summary
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {selectedRange === 'CUSTOM' ? 'Custom' : selectedRange}
                            </span>
                        </CardTitle>
                        <CardDescription>
                            Spending by category for the selected period
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        {loading && (
                            <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center backdrop-blur-[1px] transition-all duration-200">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        )}
                        <div className="h-[300px] w-full">
                            {spendingData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={spendingData}
                                            cx="40%"
                                            cy="50%"
                                            innerRadius={85}
                                            outerRadius={115}
                                            paddingAngle={2}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {spendingData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            content={<CustomPieTooltip currency={data?.account.balances.iso_currency_code} />}
                                            cursor={false} 
                                        />
                                        <Legend 
                                            layout="vertical" 
                                            verticalAlign="middle" 
                                            align="right"
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '12px', color: 'var(--muted-foreground)' }}
                                            width={140}
                                        />
                                        <text x="40%" y="50%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan dx="-3em" dy="-0.5em" fontSize="18" fontWeight="bold" className="fill-foreground">
                                                {formatCurrency(totalSpending, data?.account.balances.iso_currency_code || 'USD')}
                                            </tspan>
                                            <tspan dx="-50" dy="1.5em" fontSize="12" className="fill-muted-foreground">
                                                Total
                                            </tspan>
                                        </text>
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    No spending data available for this period
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-3">
                            Transactions
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {selectedRange === 'CUSTOM' ? 'Custom' : selectedRange}
                            </span>
                        </CardTitle>
                        <div className="relative" ref={downloadMenuRef}>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={isDownloadMenuOpen ? "gap-2 text-foreground bg-accent border animate-in" : "gap-2 text-muted-foreground hover:text-foreground border border-transparent animate-in"}
                                onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                                disabled={!data || data.transactions.length === 0}
                            >
                                <Download className="h-4 w-4" />
                                Download
                            </Button>
                            
                            {isDownloadMenuOpen && (
                                <div className="text-muted-foreground absolute right-0 top-full w-26 bg-background rounded-md border bg-popover p-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                                    <button
                                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 pt-0.5 pb-0.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                        onClick={() => {
                                            handleExportCSV();
                                            setIsDownloadMenuOpen(false);
                                        }}
                                    >
                                        CSV
                                    </button>
                                    <button
                                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 pt-0.5 pb-0.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                        onClick={() => {
                                            handleExportOFX();
                                            setIsDownloadMenuOpen(false);
                                        }}
                                    >
                                        OFX
                                    </button>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="relative min-h-[200px]">
                        {loading && (
                            <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center backdrop-blur-[1px] transition-all duration-200 rounded-lg">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        )}
                        {data ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <tbody className="divide-y text-foreground">
                                        {Object.entries(
                                            data.transactions
                                            .filter(tx => {
                                                // Filter transactions to match the selected range view
                                                // (Though we fetch more for calculation, we only show requested range)
                                                // We can get the range boundaries from our helper
                                                const { start, end } = getDateRange(selectedRange);
                                                const toDateStr = (d: Date) => {
                                                    const year = d.getFullYear();
                                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                                    const day = String(d.getDate()).padStart(2, '0');
                                                    return `${year}-${month}-${day}`;
                                                };
                                                return tx.date >= toDateStr(start) && tx.date <= toDateStr(end);
                                            })
                                            .reduce((acc: Record<string, Transaction[]>, tx) => {
                                                const date = tx.date;
                                                if (!acc[date]) acc[date] = [];
                                                acc[date].push(tx);
                                                return acc;
                                            }, {})
                                        )
                                        .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
                                        .map(([date, transactions]) => (
                                            <React.Fragment key={date}>
                                                <tr>
                                                    <td colSpan={2} className="py-4 pl-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider bg-background-secondary">
                                                        {new Date(date).toLocaleDateString('en-US', { 
                                                            month: 'long', 
                                                            day: 'numeric',
                                                            year: 'numeric'
                                                        })}
                                                    </td>
                                                </tr>
                                                {transactions.map((tx) => (
                                                    <tr key={tx.transaction_id} className="hover:bg-muted/50 group border-b last:border-0 border-border/40">
                                                        <td className="py-3 pl-8">
                                                            <div className="flex items-center gap-3">
                                                                {(tx.logo_url || tx.personal_finance_category_icon_url) && (
                                                                    <div className={`h-8 w-8 flex-shrink-0 flex items-center justify-center ${
                                                                        tx.logo_url 
                                                                            ? "overflow-hidden rounded-full border bg-background" 
                                                                            : ""
                                                                    }`}>
                                                                        <img 
                                                                            src={tx.logo_url || tx.personal_finance_category_icon_url || ''} 
                                                                            alt=""
                                                                            className={`h-full w-full object-contain ${
                                                                                !tx.logo_url ? "dark:invert dark:brightness-85" : ""
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <div className="font-medium group-hover:text-primary transition-colors">
                                                                        {tx.name}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                                        {getDisplayCategory(tx) || (tx.category ? tx.category[0] : 'Uncategorized')}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className={`py-3 pr-4 text-right font-medium ${tx.amount > 0 ? 'text-red-400' : 'text-green-600'}`}>
                                                            {formatCurrency(tx.amount * -1, data.account.balances.iso_currency_code)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                        {data.transactions.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="py-8 text-center text-muted-foreground">
                                                    No transactions found for this period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="h-[200px]" /> /* Placeholder for loading state */
                        )}
                    </CardContent>
                </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
