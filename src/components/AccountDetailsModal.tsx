'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, RotateCcw, Download } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Transaction {
  transaction_id: string;
  date: string;
  name: string;
  amount: number;
  category: string[];
}

type TimeRange = '1D' | '1W' | '30D' | '3M' | '6M' | '1Y' | '5Y' | 'YTD' | 'ALL' | 'CUSTOM';

interface AccountData {
  account: {
    account_id: string;
    name: string;
    official_name: string | null;
    type: string;
    subtype: string;
    balances: {
      current: number;
      available: number | null;
      limit: number | null;
      iso_currency_code: string;
    };
  };
  transactions: Transaction[];
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
        {/* Vertical Line - spanning the chart area only */}
        <div 
          className="absolute w-[1px] bg-border border-l border-dashed border-foreground/30"
          style={{ 
            left: x, 
            top: topMargin, 
            height: height - topMargin - bottomMargin 
          }}
        />
        
        {/* Top Label (Balance) - placed in the top margin area */}
        <div 
          className={labelClass}
          style={{ ...labelStyle, top: 10 }} // Fixed distance from top of container
        >
          <div>
            <span className="text-lg font-bold tracking-tight">{formattedValue}</span>
          </div>
        </div>

        {/* Bottom Label (Date) - placed in the bottom margin area */}
        <div 
          className={labelClass}
          style={{ ...labelStyle, bottom: 20 }} // Fixed distance from bottom of container
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
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dateError, setDateError] = useState<string | null>(null);

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
      case '5Y':
        start.setFullYear(end.getFullYear() - 5);
        break;
      case 'YTD':
        start.setMonth(0, 1);
        break;
      case 'ALL':
        start.setFullYear(end.getFullYear() - 10);
        break;
    }
    return { start, end };
  };

  // Reset state when modal opens/closes or account changes
  useEffect(() => {
    if (isOpen && accountId) {
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
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch account details');
      }

      const result = await response.json();
      setData(result);
      calculateBalanceHistory(result.account.balances.current, result.transactions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const calculateBalanceHistory = (currentBalance: number, transactions: Transaction[]) => {
    // We expect transactions from 'now' back to at least startDate.
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const txMap: Record<string, number> = {};
    sortedTransactions.forEach(tx => {
        txMap[tx.date] = (txMap[tx.date] || 0) + tx.amount;
    });

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
            const category = tx.category ? `"${tx.category.join(';')}"` : '';
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-background rounded-lg shadow-xl border">
        
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-background/95 backdrop-blursupports-[backdrop-filter]:bg-background/60">
            <div>
                 {data ? (
                    <>
                        <h2 className="text-xl font-bold">{data.account.name}</h2>
                        <p className="text-sm text-muted-foreground">{data.account.type.toUpperCase()} • {data.account.subtype.toUpperCase()}</p>
                    </>
                 ) : (
                    <h2 className="text-xl font-bold">Account Details</h2>
                 )}
            </div>
            <div className="flex items-center gap-4">
                {(institutionName || institutionLogo) && (
                    <div className="flex items-center gap-2 border-r pr-4 mr-2 border-border/50">
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
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="text-3xl font-bold text-primary min-h-[40px] flex items-center mt-1">
                        {data ? (
                            formatCurrency(data.account.balances.current, data.account.balances.iso_currency_code)
                        ) : (
                            loading && <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-wrap items-center bg-muted/40 p-1 rounded-lg border gap-0.5">
                          {(['1D', '1W', '30D', '3M', '6M', '1Y', '5Y', 'YTD', 'ALL', 'CUSTOM'] as const).map((r) => (
                            <Button
                              key={r}
                              variant="ghost"
                              size="sm"
                              className={`h-7 px-2 text-xs hover:bg-background/50 ${selectedRange === r ? 'bg-background shadow-sm hover:bg-background text-foreground' : 'text-muted-foreground'}`}
                              onClick={() => setSelectedRange(r)}
                              disabled={loading && !data}
                            >
                              {r === 'CUSTOM' ? 'Custom' : r}
                            </Button>
                          ))}
                        </div>

                        {selectedRange === 'CUSTOM' && (
                            <div className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="date" 
                                        value={customStart}
                                        onChange={(e) => setCustomStart(e.target.value)}
                                        className={`h-8 rounded-md border bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${dateError ? 'border-red-500 text-red-500 focus-visible:ring-red-500' : 'border-input'}`}
                                    />
                                    <span className="text-muted-foreground text-xs">to</span>
                                    <input 
                                        type="date" 
                                        value={customEnd}
                                        onChange={(e) => setCustomEnd(e.target.value)}
                                        className={`h-8 rounded-md border bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${dateError ? 'border-red-500 text-red-500 focus-visible:ring-red-500' : 'border-input'}`}
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                            const d = new Date();
                                            d.setDate(d.getDate() - 30);
                                            setCustomStart(d.toISOString().split('T')[0]);
                                            setCustomEnd(new Date().toISOString().split('T')[0]);
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
                                        margin={{ top: 40, right: 0, left: 0, bottom: 40 }}
                                    >
                                        <defs>
                                            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" hide />
                                        <Tooltip 
                                            content={<CustomTooltip topMargin={40} bottomMargin={40} />} 
                                            cursor={false}
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
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Transactions</CardTitle>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={handleExportCSV}
                            disabled={!data || data.transactions.length === 0}
                        >
                            <Download className="h-4 w-4" />
                            Export CSV
                        </Button>
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
                                                            <div className="font-medium group-hover:text-primary transition-colors">
                                                                {tx.name}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                                {tx.category ? tx.category[0] : 'Uncategorized'}
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
