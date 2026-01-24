'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ChevronDown, Loader2, Filter, ArrowUp, ArrowDown, RotateCcw, Building2, X, Wallet } from 'lucide-react';
import ImportTransactionsDialog from '@/components/ImportTransactionsDialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from 'next-themes';

type TimeRange = '1D' | '1W' | '30D' | '3M' | '6M' | '1Y' | '2Y' | 'YTD' | 'MAX' | 'CUSTOM';

interface Transaction {
    transaction_id: string;
    account_id: string;
    date: string;
    name: string;
    amount: number;
    iso_currency_code?: string;
    category: string[];
    pending: boolean;
    merchant_name?: string;
    payment_channel?: string;
    authorized_date?: string;
    personal_finance_category?: {
        primary: string;
        detailed: string;
        confidence_level?: string;
    } | null;
    isImported?: boolean;
}

interface ImportedAccount {
    account_id: string;
    name: string;
    institution_name: string;
    type: 'imported';
    isImported: true;
}

interface SpendingAnalysisProps {
    accounts: any[];
    accessTokens: string[];
    onAccountClick?: (accountId: string) => void;
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

const formatCurrency = (amount: number) => {
    return amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const formatDateToLocalYMD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
};

// Custom Bar shape with hover handling
const CustomBar = (props: any) => {
    const { fill, x, y, width, height, payload, dataKey, onHover, onLeave, isHovered, isDimmed } = props;

    if (!width || !height || height < 0) return null;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={fill}
                opacity={isDimmed ? 0.3 : 1}
                stroke={isHovered ? '#ffffff' : 'none'}
                strokeWidth={isHovered ? 2 : 0}
                onMouseMove={(e) => {
                    onHover(dataKey, payload[dataKey], x + width / 2, y);
                }}
                onMouseEnter={(e) => {
                    onHover(dataKey, payload[dataKey], x + width / 2, y);
                }}
                onMouseLeave={(e) => {
                    onLeave();
                }}
                style={{ cursor: 'pointer' }}
            />
        </g>
    );
};

export default function SpendingAnalysis({ accounts, accessTokens, onAccountClick }: SpendingAnalysisProps) {
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterDropdownRef = useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [importedAccounts, setImportedAccounts] = useState<ImportedAccount[]>([]);
    const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([]);

    // Chart configuration state
    const [chartTimePeriod, setChartTimePeriod] = useState<'day' | 'week' | 'month'>('week');
    const [chartGroupBy, setChartGroupBy] = useState<'category' | 'account' | 'institution'>('category');
    const [hiddenChartItems, setHiddenChartItems] = useState<Set<string>>(new Set());
    const [hoveredChartItem, setHoveredChartItem] = useState<string | null>(null);
    const [hoveredBarSection, setHoveredBarSection] = useState<{ category: string; value: number; x: number; y: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const hoveredBarRef = useRef<{ category: string; value: number } | null>(null);

    // Theme
    const { resolvedTheme } = useTheme();

    // Time range state
    const [selectedRange, setSelectedRange] = useState<TimeRange>('30D');
    const [customStart, setCustomStart] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return formatDateToLocalYMD(d);
    });
    const [customEnd, setCustomEnd] = useState<string>(() => formatDateToLocalYMD(new Date()));
    const [dateError, setDateError] = useState<string | null>(null);

    // Filter only Depository and Credit accounts for selection, plus imported accounts
    const eligibleAccounts = useMemo(() => {
        const plaidAccounts = accounts.filter(acc =>
            acc.type === 'depository' ||
            acc.type === 'credit'
        );
        return [...plaidAccounts, ...importedAccounts];
    }, [accounts, importedAccounts]);

    // No longer auto-selecting accounts - user must select manually

    // Handle click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };

        if (isFilterOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [isFilterOpen]);

    const getDateRange = (range: TimeRange) => {
        const end = new Date();
        const start = new Date();

        if (range === 'CUSTOM') {
            const s = new Date(customStart);
            s.setHours(0, 0, 0, 0);

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

    const handleImport = (accountName: string, institutionName: string, importedTxs: any[]) => {
        // Generate a unique account ID
        const accountId = `imported_${Date.now()}`;

        // Create the imported account
        const newAccount: ImportedAccount = {
            account_id: accountId,
            name: accountName,
            institution_name: institutionName,
            type: 'imported',
            isImported: true,
        };

        // Transform imported transactions to match Transaction interface
        const newTransactions: Transaction[] = importedTxs.map((tx, index) => ({
            transaction_id: `${accountId}_${index}`,
            account_id: accountId,
            date: tx.date,
            name: tx.name,
            amount: tx.amount,
            iso_currency_code: tx.currency,
            category: [tx.category],
            pending: false,
            isImported: true,
            personal_finance_category: null,
        }));

        // Add to state
        setImportedAccounts(prev => [...prev, newAccount]);
        setImportedTransactions(prev => [...prev, ...newTransactions]);

        // Auto-select the new account
        setSelectedAccountIds(prev => new Set([...prev, accountId]));
    };

    const toggleAccount = (accountId: string) => {
        setSelectedAccountIds(prev => {
            const next = new Set(prev);
            if (next.has(accountId)) {
                next.delete(accountId);
            } else {
                next.add(accountId);
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedAccountIds.size === eligibleAccounts.length) {
            setSelectedAccountIds(new Set());
        } else {
            setSelectedAccountIds(new Set(eligibleAccounts.map(a => a.account_id)));
        }
    };

    const fetchTransactions = async () => {
        if (selectedAccountIds.size === 0) {
            setTransactions([]);
            return;
        }

        // Check custom date validity
        if (selectedRange === 'CUSTOM') {
            if (customStart > customEnd) {
                setDateError('Start date cannot be after end date');
                setTransactions([]);
                setLoading(false);
                return;
            }
            setDateError(null);
        }

        setLoading(true);
        try {
            // Group selected account IDs by access_token (exclude imported accounts)
            const accountsByToken: Record<string, string[]> = {};

            selectedAccountIds.forEach(id => {
                const account = accounts.find(a => a.account_id === id);
                if (account && account.access_token) {
                    if (!accountsByToken[account.access_token]) {
                        accountsByToken[account.access_token] = [];
                    }
                    accountsByToken[account.access_token].push(id);
                }
            });

            // Calculate date range
            const { start, end } = getDateRange(selectedRange);
            const endDate = end.toISOString().split('T')[0];
            const startDate = start.toISOString().split('T')[0];

            const promises = Object.entries(accountsByToken).map(([token, ids]) =>
                fetch('/api/get_transactions', {
                    method: 'POST',
                    body: JSON.stringify({
                        access_token: token,
                        account_ids: ids,
                        startDate,
                        endDate,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                }).then(res => res.json())
            );

            const results = await Promise.all(promises);

            let combined: Transaction[] = [];
            results.forEach(res => {
                if (res.transactions) {
                    combined = combined.concat(res.transactions);
                }
            });

            setTransactions(combined);

        } catch (error) {
            console.error("Failed to fetch transactions", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [selectedAccountIds, selectedRange, customStart, customEnd]);

    const sortedTransactions = useMemo(() => {
        // Calculate date range for filtering imported transactions
        const { start, end } = getDateRange(selectedRange);

        // Filter imported transactions by selected accounts and date range
        const selectedImportedTxs = importedTransactions.filter(tx => {
            if (!selectedAccountIds.has(tx.account_id)) return false;

            const txDate = new Date(tx.date);
            return txDate >= start && txDate <= end;
        });

        // Combine regular and imported transactions
        const allTransactions = [...transactions, ...selectedImportedTxs];

        const filtered = allTransactions.filter(tx => {
            const account = accounts.find(a => a.account_id === tx.account_id);
            const importedAccount = importedAccounts.find(a => a.account_id === tx.account_id);

            // Filter out money in (negative amounts) for depository accounts (checking/savings)
            if (account && account.type === 'depository' && tx.amount < 0) {
                return false;
            }
            return true;
        });

        return [...filtered].sort((a: any, b: any) => {
            if (sortConfig.key === 'account') {
                const accountA = accounts.find(acc => acc.account_id === a.account_id) || importedAccounts.find(acc => acc.account_id === a.account_id);
                const accountB = accounts.find(acc => acc.account_id === b.account_id) || importedAccounts.find(acc => acc.account_id === b.account_id);
                const nameA = accountA ? (accountA.institution_name + accountA.name).toLowerCase() : '';
                const nameB = accountB ? (accountB.institution_name + accountB.name).toLowerCase() : '';

                if (nameA < nameB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (nameA > nameB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [transactions, importedTransactions, selectedAccountIds, selectedRange, customStart, customEnd, sortConfig, accounts, importedAccounts]);

    const handleSort = (key: string) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-50" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />;
    };

    // Process data for stacked bar chart
    const chartData = useMemo(() => {
        if (sortedTransactions.length === 0) return [];

        // Group transactions by time period
        const groupedByPeriod: Record<string, Transaction[]> = {};

        sortedTransactions.forEach(tx => {
            const date = new Date(tx.date);
            let periodKey: string;

            if (chartTimePeriod === 'day') {
                periodKey = date.toISOString().split('T')[0];
            } else if (chartTimePeriod === 'week') {
                // Get week start (Sunday)
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                periodKey = weekStart.toISOString().split('T')[0];
            } else { // month
                periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }

            if (!groupedByPeriod[periodKey]) {
                groupedByPeriod[periodKey] = [];
            }
            groupedByPeriod[periodKey].push(tx);
        });

        // Get all unique grouping keys (categories, accounts, or institutions)
        const groupKeys = new Set<string>();
        sortedTransactions.forEach(tx => {
            let key: string;
            if (chartGroupBy === 'category') {
                key = getDisplayCategory(tx) || (tx.category ? tx.category[0] : 'Uncategorized');
            } else if (chartGroupBy === 'account') {
                const account = accounts.find(a => a.account_id === tx.account_id) ||
                    importedAccounts.find(a => a.account_id === tx.account_id);
                key = account ? `${account.institution_name} - ${account.name}` : 'Unknown';
            } else { // institution
                const account = accounts.find(a => a.account_id === tx.account_id) ||
                    importedAccounts.find(a => a.account_id === tx.account_id);
                key = account ? account.institution_name : 'Unknown';
            }
            groupKeys.add(key);
        });

        // Build chart data
        const data = Object.entries(groupedByPeriod)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, txs]) => {
                const dataPoint: any = { period };

                // Format period label
                if (chartTimePeriod === 'day') {
                    dataPoint.periodLabel = new Date(period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                } else if (chartTimePeriod === 'week') {
                    const weekStart = new Date(period);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 6);
                    dataPoint.periodLabel = `Week of ${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                } else { // month
                    const [year, month] = period.split('-');
                    dataPoint.periodLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
                }

                // Group transactions within this period
                const grouped: Record<string, number> = {};
                txs.forEach(tx => {
                    let key: string;
                    if (chartGroupBy === 'category') {
                        key = getDisplayCategory(tx) || (tx.category ? tx.category[0] : 'Uncategorized');
                    } else if (chartGroupBy === 'account') {
                        const account = accounts.find(a => a.account_id === tx.account_id) ||
                            importedAccounts.find(a => a.account_id === tx.account_id);
                        key = account ? `${account.institution_name} - ${account.name}` : 'Unknown';
                    } else { // institution
                        const account = accounts.find(a => a.account_id === tx.account_id) ||
                            importedAccounts.find(a => a.account_id === tx.account_id);
                        key = account ? account.institution_name : 'Unknown';
                    }

                    if (!grouped[key]) grouped[key] = 0;
                    grouped[key] += tx.amount;
                });

                // Add all groups to data point
                groupKeys.forEach(key => {
                    dataPoint[key] = grouped[key] || 0;
                });

                return dataPoint;
            });

        return data;
    }, [sortedTransactions, chartTimePeriod, chartGroupBy, accounts, importedAccounts]);

    // Generate colors for chart bars
    const chartColors = useMemo(() => {
        const keys = chartData.length > 0 ? Object.keys(chartData[0]).filter(k => k !== 'period' && k !== 'periodLabel') : [];
        const colors = resolvedTheme === 'dark' ? [
            '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
            '#db2777', '#0d9488', '#ea580c', '#4f46e5', '#65a30d',
            '#0891b2', '#e11d48', '#16a34a', '#ca8a04', '#9333ea'
        ] : [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
            '#06b6d4', '#f43f5e', '#22c55e', '#eab308', '#a855f7'
        ];

        const colorMap: Record<string, string> = {};
        keys.forEach((key, i) => {
            colorMap[key] = colors[i % colors.length];
        });

        return { keys, colorMap };
    }, [chartData, resolvedTheme]);

    // Reset hidden items when groupBy changes
    useEffect(() => {
        setHiddenChartItems(new Set());
    }, [chartGroupBy]);

    const toggleChartItem = (item: string) => {
        setHiddenChartItems(prev => {
            const next = new Set(prev);
            if (next.has(item)) {
                next.delete(item);
            } else {
                next.add(item);
            }
            return next;
        });
    };

    const visibleChartKeys = useMemo(() => {
        return chartColors.keys.filter(key => !hiddenChartItems.has(key));
    }, [chartColors.keys, hiddenChartItems]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-semibold text-foreground">Spending Analysis</h2>
                    <p className="text-muted-foreground">
                        Showing transactions for {selectedAccountIds.size} account{selectedAccountIds.size !== 1 && 's'}
                    </p>
                </div>

                <div className="relative flex flex-col items-end gap-2">
                    <div className="flex flex-wrap items-center bg-card p-1 rounded-lg border gap-0.5">
                        {(['1D', '1W', '30D', '3M', '6M', '1Y', '2Y', 'YTD', 'MAX', 'CUSTOM'] as const).map((r) => (
                            <Button
                                key={r}
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-xs hover:bg-background ${selectedRange === r ? 'bg-background border hover:bg-background text-foreground' : 'text-muted-foreground'}`}
                                onClick={() => setSelectedRange(r)}
                            >
                                {r === 'CUSTOM' ? 'Custom' : r}
                            </Button>
                        ))}
                    </div>

                    {selectedRange === 'CUSTOM' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
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
                    )}

                    <div className="flex justify-end w-full gap-2">
                        <ImportTransactionsDialog onImport={handleImport} />
                        <div className="relative" ref={filterDropdownRef}>
                            <Button
                                variant="outline"
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center gap-2"
                            >
                                <Filter className="h-4 w-4" />
                                Filter Accounts
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>

                            {isFilterOpen && (
                                <div className="absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto z-50 rounded-md border bg-popover p-4 shadow-md text-popover-foreground">
                                    <div className="space-y-2">
                                        <div
                                            className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded"
                                            onClick={toggleAll}
                                        >
                                            <div className={`
                                                flex h-4 w-4 items-center justify-center rounded border border-primary 
                                                ${selectedAccountIds.size === eligibleAccounts.length ? 'bg-primary text-primary-foreground' : 'opacity-50'}
                                            `}>
                                                {selectedAccountIds.size === eligibleAccounts.length && <Check className="h-3 w-3" />}
                                            </div>
                                            <span className="text-sm font-medium">Select All</span>
                                        </div>
                                        <div className="h-px bg-border my-2" />
                                        {eligibleAccounts.map(account => (
                                            <div
                                                key={account.account_id}
                                                className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded"
                                                onClick={() => toggleAccount(account.account_id)}
                                            >
                                                <div className={`
                                                    flex h-4 w-4 items-center justify-center rounded border border-primary 
                                                    ${selectedAccountIds.has(account.account_id) ? 'bg-primary text-primary-foreground' : 'opacity-50'}
                                                `}>
                                                    {selectedAccountIds.has(account.account_id) && <Check className="h-3 w-3" />}
                                                </div>
                                                <div className="flex items-center gap-2 flex-1">
                                                    {account.isImported ? (
                                                        <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                                                            <Wallet className="h-3 w-3 text-blue-700 dark:text-blue-300" />
                                                        </div>
                                                    ) : null}
                                                    <div className="flex flex-col overflow-hidden">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-medium">{account.name}</span>
                                                            {account.isImported && (
                                                                <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                                                                    Imported
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            {account.institution_name}
                                                            {!account.isImported && account.mask && ` • ${account.mask}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="border rounded-lg p-4">
                {selectedAccountIds.size === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Filter className="h-12 w-12 text-muted-foreground/50" />
                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium text-foreground">No accounts selected</p>
                            <p className="text-sm text-muted-foreground">Select accounts to view and analyze your transactions</p>
                        </div>
                        <Button
                            variant="default"
                            onClick={() => setIsFilterOpen(true)}
                            className="flex items-center gap-2"
                        >
                            <Filter className="h-4 w-4" />
                            Select Accounts
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                        {eligibleAccounts.filter(acc => selectedAccountIds.has(acc.account_id)).map(account => (
                            <Card
                                key={account.account_id}
                                className="h-full cursor-pointer hover:border-accent hover:bg-secondary-foreground/15 transition-colors group relative"
                                onClick={() => onAccountClick?.(account.account_id)}
                            >
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 hover:bg-destructive/10 hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleAccount(account.account_id);
                                        }}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pt-5">
                                    <div className="space-y-1 overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-sm font-medium truncate pr-4">
                                                {account.name}
                                            </CardTitle>
                                            {account.isImported && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                                                    Imported
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {account.institution_name}
                                        </p>
                                    </div>
                                    {account.isImported ? (
                                        <div className="h-8 w-8 min-w-[2rem] rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                            <Wallet className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                                        </div>
                                    ) : account.institution_logo ? (
                                        <div className="h-8 w-8 min-w-[2rem] flex items-center justify-center">
                                            <img
                                                src={`data:image/png;base64,${account.institution_logo}`}
                                                alt={account.institution_name}
                                                className="max-w-full max-h-full object-contain"
                                            />
                                        </div>
                                    ) : (
                                        <div className="h-8 w-8 min-w-[2rem] rounded-full bg-secondary flex items-center justify-center">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    )}
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Spending Chart Section */}
            {selectedAccountIds.size > 0 && sortedTransactions.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <CardTitle className="text-lg">Spending Overview</CardTitle>
                            <div className="flex flex-wrap gap-2">
                                <div className="flex items-center bg-card border rounded-lg p-1 gap-0.5">
                                    {(['day', 'week', 'month'] as const).map((period) => (
                                        <Button
                                            key={period}
                                            variant="ghost"
                                            size="sm"
                                            className={`h-7 px-3 text-xs capitalize ${chartTimePeriod === period
                                                    ? 'bg-background border hover:bg-background text-foreground'
                                                    : 'text-muted-foreground'
                                                }`}
                                            onClick={() => setChartTimePeriod(period)}
                                        >
                                            {period}
                                        </Button>
                                    ))}
                                </div>
                                <div className="flex items-center bg-card border rounded-lg p-1 gap-0.5">
                                    {(['category', 'account', 'institution'] as const).map((group) => (
                                        <Button
                                            key={group}
                                            variant="ghost"
                                            size="sm"
                                            className={`h-7 px-3 text-xs capitalize ${chartGroupBy === group
                                                    ? 'bg-background border hover:bg-background text-foreground'
                                                    : 'text-muted-foreground'
                                                }`}
                                            onClick={() => setChartGroupBy(group)}
                                        >
                                            {group}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Loading chart...</p>
                            </div>
                        ) : chartData.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No data available for chart
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="w-full h-96 relative">
                                    {/* Custom tooltip */}
                                    <div
                                        ref={tooltipRef}
                                        className="absolute z-50 px-3 py-2 text-sm bg-popover border border-border rounded-md shadow-lg pointer-events-none"
                                        style={{
                                            display: 'none',
                                            left: '0px',
                                            top: '0px',
                                            transform: 'translate(-50%, -100%)',
                                        }}
                                    >
                                        <div className="font-medium" id="tooltip-category"></div>
                                        <div className="text-muted-foreground" id="tooltip-value"></div>
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={chartData}
                                            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                            onMouseLeave={() => setHoveredBarSection(null)}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis
                                                dataKey="periodLabel"
                                                angle={-45}
                                                textAnchor="end"
                                                height={60}
                                                tick={{ fill: resolvedTheme === 'dark' ? '#71717a' : '#a1a1aa', fontSize: 12, dy: 5 }}
                                            />
                                            <YAxis
                                                tick={{ fill: resolvedTheme === 'dark' ? '#71717a' : '#a1a1aa', fontSize: 12 }}
                                                tickFormatter={(value) => `$${value.toLocaleString()}`}
                                            />
                                            {visibleChartKeys.map((key) => {
                                                const isHovered = hoveredBarSection?.category === key || hoveredChartItem === key;
                                                const isDimmed = (hoveredBarSection !== null && hoveredBarSection.category !== key) ||
                                                    (hoveredChartItem !== null && hoveredChartItem !== key && hoveredBarSection === null);
                                                return (
                                                    <Bar
                                                        key={key}
                                                        dataKey={key}
                                                        stackId="a"
                                                        fill={chartColors.colorMap[key]}
                                                        name={key}
                                                        shape={<CustomBar
                                                            onHover={(dataKey: string, value: number, x: number, y: number) => {
                                                                // Direct DOM manipulation for instant tooltip updates
                                                                const tooltip = tooltipRef.current;
                                                                if (tooltip) {
                                                                    tooltip.style.display = 'block';
                                                                    tooltip.style.left = `${x}px`;
                                                                    tooltip.style.top = `${y - 10}px`;
                                                                    const categoryEl = tooltip.querySelector('#tooltip-category');
                                                                    const valueEl = tooltip.querySelector('#tooltip-value');
                                                                    if (categoryEl) categoryEl.textContent = dataKey;
                                                                    if (valueEl) valueEl.textContent = `$${value.toFixed(2)}`;
                                                                }
                                                                hoveredBarRef.current = { category: dataKey, value };
                                                                setHoveredBarSection({ category: dataKey, value, x, y });
                                                            }}
                                                            onLeave={() => {
                                                                const tooltip = tooltipRef.current;
                                                                if (tooltip) {
                                                                    tooltip.style.display = 'none';
                                                                }
                                                                hoveredBarRef.current = null;
                                                                setHoveredBarSection(null);
                                                            }}
                                                            isHovered={isHovered}
                                                            isDimmed={isDimmed}
                                                        />}
                                                    />
                                                );
                                            })}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Filter chips */}
                                {chartColors.keys.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 pb-3">
                                        {chartColors.keys.length > 1 && (
                                            <>
                                                <button
                                                    onClick={() => setHiddenChartItems(new Set())}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 border border-primary"
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    onClick={() => setHiddenChartItems(new Set(chartColors.keys))}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
                                                >
                                                    Remove All
                                                </button>
                                            </>
                                        )}
                                        {chartColors.keys.map((key) => {
                                            const isHidden = hiddenChartItems.has(key);
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => toggleChartItem(key)}
                                                    onMouseEnter={() => setHoveredChartItem(key)}
                                                    onMouseLeave={() => setHoveredChartItem(null)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:shadow-md ${isHidden
                                                            ? 'bg-muted text-muted-foreground opacity-50 hover:opacity-75'
                                                            : 'text-white shadow-sm hover:shadow-md'
                                                        }`}
                                                    style={{
                                                        backgroundColor: isHidden ? undefined : chartColors.colorMap[key]
                                                    }}
                                                >
                                                    <div
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ backgroundColor: chartColors.colorMap[key] }}
                                                    />
                                                    <span>{key}</span>
                                                    {!isHidden && <X className="h-3 w-3" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {selectedAccountIds.size > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Transactions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Loading transactions...</p>
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No transactions found for the selected accounts in this period.
                            </div>
                        ) : (
                            <div className="relative w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm">
                                    <thead className="[&_tr]:border-b">
                                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer group" onClick={() => handleSort('date')}>
                                                <div className="flex items-center gap-1">Date <SortIcon column="date" /></div>
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer group" onClick={() => handleSort('account')}>
                                                <div className="flex items-center gap-1">Account <SortIcon column="account" /></div>
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer group" onClick={() => handleSort('name')}>
                                                <div className="flex items-center gap-1">Name <SortIcon column="name" /></div>
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                                                Category
                                            </th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer group" onClick={() => handleSort('amount')}>
                                                <div className="flex items-center justify-end gap-1">Amount <SortIcon column="amount" /></div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {sortedTransactions.map((tx) => {
                                            const account = accounts.find(a => a.account_id === tx.account_id);
                                            const importedAccount = importedAccounts.find(a => a.account_id === tx.account_id);
                                            const displayAccount = account || importedAccount;

                                            return (
                                                <tr key={tx.transaction_id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                                    <td className="p-4 align-middle">{formatDate(tx.date)}</td>
                                                    <td className="p-4 align-middle text-muted-foreground">
                                                        <div className="flex items-center gap-3">
                                                            {tx.isImported ? (
                                                                <div className="h-6 w-6 min-w-[1.5rem] rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                                                    <Wallet className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300" />
                                                                </div>
                                                            ) : account?.institution_logo ? (
                                                                <div className="h-6 w-6 min-w-[1.5rem] flex items-center justify-center">
                                                                    <img
                                                                        src={`data:image/png;base64,${account.institution_logo}`}
                                                                        alt={account.institution_name}
                                                                        className="max-w-full max-h-full object-contain"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="h-6 w-6 min-w-[1.5rem] rounded-full bg-secondary flex items-center justify-center">
                                                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                                                </div>
                                                            )}
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium text-foreground">{displayAccount ? displayAccount.name : 'Unknown Account'}</span>
                                                                <span className="text-xs">{displayAccount?.institution_name}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle font-medium">{tx.name}</td>
                                                    <td className="p-4 align-middle text-muted-foreground">
                                                        {getDisplayCategory(tx) || (tx.category ? tx.category[0] : 'Uncategorized')}
                                                    </td>
                                                    <td className={`p-4 align-middle text-right font-medium ${tx.amount < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                                                        {formatCurrency(tx.amount)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
