'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ChevronDown, Loader2, Filter, ArrowUp, ArrowDown, RotateCcw, Building2, X } from 'lucide-react';

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

export default function SpendingAnalysis({ accounts, accessTokens, onAccountClick }: SpendingAnalysisProps) {
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    // Time range state
    const [selectedRange, setSelectedRange] = useState<TimeRange>('30D');
    const [customStart, setCustomStart] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return formatDateToLocalYMD(d);
    });
    const [customEnd, setCustomEnd] = useState<string>(() => formatDateToLocalYMD(new Date()));
    const [dateError, setDateError] = useState<string | null>(null);

    // Filter only Depository and Credit accounts for selection
    const eligibleAccounts = useMemo(() => {
        return accounts.filter(acc => 
            acc.type === 'depository' || 
            acc.type === 'credit'
        );
    }, [accounts]);

    // Initialize with all eligible accounts selected
    useEffect(() => {
        if (eligibleAccounts.length > 0 && selectedAccountIds.size === 0) {
            setSelectedAccountIds(new Set(eligibleAccounts.map(a => a.account_id)));
        }
    }, [eligibleAccounts.length]); // Run once when accounts are loaded

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
            // Group selected account IDs by access_token
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
        return [...transactions].sort((a: any, b: any) => {
            if (sortConfig.key === 'account') {
                const accountA = accounts.find(acc => acc.account_id === a.account_id);
                const accountB = accounts.find(acc => acc.account_id === b.account_id);
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
    }, [transactions, sortConfig, accounts]);

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
                    
                    <div className="flex justify-end w-full">
                        <div className="relative">
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
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{account.name}</span>
                                                    <span className="text-xs text-muted-foreground">{account.institution_name} • {account.mask}</span>
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
                                <CardTitle className="text-sm font-medium truncate pr-4">
                                    {account.name}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground truncate">
                                    {account.institution_name}
                                </p>
                            </div>
                            {account.institution_logo ? (
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
                                            <div className="flex items-center gap-1">Description <SortIcon column="name" /></div>
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
                                        return (
                                            <tr key={tx.transaction_id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                                <td className="p-4 align-middle">{formatDate(tx.date)}</td>
                                                <td className="p-4 align-middle text-muted-foreground">
                                                    <div className="flex items-center gap-3">
                                                        {account?.institution_logo ? (
                                                            <div className="h-6 w-6 min-w-[2rem] flex items-center justify-center">
                                                                <img
                                                                    src={`data:image/png;base64,${account.institution_logo}`}
                                                                    alt={account.institution_name}
                                                                    className="max-w-full max-h-full object-contain"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="h-6 w-6 min-w-[2rem] rounded-full bg-secondary flex items-center justify-center">
                                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-foreground">{account ? account.name : 'Unknown Account'}</span>
                                                            <span className="text-xs">{account?.institution_name}</span>
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
        </div>
    );
}
