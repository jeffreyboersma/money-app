'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ChevronDown, Loader2, Filter, ArrowUp, ArrowDown } from 'lucide-react';

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
}

interface SpendingAnalysisProps {
    accounts: any[];
    accessTokens: string[];
}

const formatCurrency = (amount: number) => {
    // Plaid: Positive amount = money spent (except for credit card payments usually?)
    // Standard interpretation: +ve is outflow, -ve is inflow for Plaid transactions usually.
    // Let's display it as is, or maybe inverse for clarity if the user expects "Income" vs "Expense".
    // Usually in spending analysis, we just show the amount.
    return amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
};

export default function SpendingAnalysis({ accounts, accessTokens }: SpendingAnalysisProps) {
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

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

            // Calculate date range (e.g., last 30 days)
            const endDate = new Date().toISOString().split('T')[0];
            const startDateObj = new Date();
            startDateObj.setDate(startDateObj.getDate() - 30);
            const startDate = startDateObj.toISOString().split('T')[0];

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
    }, [selectedAccountIds]); // Re-fetch when selection changes? 
    // Optimization: Maybe add a "Apply" button if datasets are huge, but for now auto-fetch is smoother.

    const sortedTransactions = useMemo(() => {
        return [...transactions].sort((a: any, b: any) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [transactions, sortConfig]);

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
                        Showing transactions for {selectedAccountIds.size} account{selectedAccountIds.size !== 1 && 's'} (Last 30 Days)
                    </p>
                </div>
                
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
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer group" onClick={() => handleSort('name')}>
                                            <div className="flex items-center gap-1">Description <SortIcon column="name" /></div>
                                        </th>
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                                            Category
                                        </th>
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                                            Account
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
                                                <td className="p-4 align-middle font-medium">{tx.name}</td>
                                                <td className="p-4 align-middle text-muted-foreground">
                                                    {tx.category ? tx.category[0] : 'Uncategorized'}
                                                </td>
                                                <td className="p-4 align-middle text-muted-foreground">
                                                    {account ? account.name : 'Unknown Account'}
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
