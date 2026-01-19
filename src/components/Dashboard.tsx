'use client';

import React, { useState, useEffect } from 'react';
import LinkButton from './LinkButton';
import AccountDetailsModal from './AccountDetailsModal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Wallet, RefreshCw, AlertCircle, Trash2, Building2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const formatCurrency = (amount: number) => {
    const isNegative = amount < 0;
    const formatted = Math.abs(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return isNegative ? `-$${formatted}` : `$${formatted}`;
};

const AccountCard = ({ account, onClick }: { account: any, onClick: () => void }) => (
    <div onClick={onClick} className="block h-full cursor-pointer">
        <Card className="hover:border-accent hover:bg-secondary-foreground/15 transition-colors h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-sm font-medium text-foreground">{account.name}</CardTitle>
                    <div className="flex items-center gap-1.5 leading-none">
                        <p className="text-[10px] font-medium text-muted-foreground/80">{account.institution_name}</p>
                        <span className="text-[10px] text-muted-foreground/40">•</span>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{account.subtype}</p>
                    </div>
                </div>
                {account.institution_logo ? (
                    <div className="w-8 h-8 flex items-center justify-center">
                        <img
                            src={`data:image/png;base64,${account.institution_logo}`}
                            alt={account.institution_name}
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(account.balances.current)}
                </div>
                <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-muted-foreground">
                        Ending in {account.mask}
                    </p>
                    {account.balances.available !== null && (
                        <p className="text-[10px] text-muted-foreground/60">
                            Avail: {formatCurrency(account.balances.available)}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    </div>
);

export default function Dashboard() {
    const [accessTokens, setAccessTokens] = useState<string[]>([]);
    const [allAccounts, setAllAccounts] = useState<any[]>([]);
    const [institutions, setInstitutions] = useState<Record<string, { name: string; logo?: string }>>({});
    const [loading, setLoading] = useState(false);
    const [removingToken, setRemovingToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'institution' | 'type'>('institution');
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    // Find the selected account object to pass inst data
    const selectedAccount = allAccounts.find(acc => acc.account_id === selectedAccountId);

    // Load tokens from localStorage on mount
    useEffect(() => {
        const savedTokens = localStorage.getItem('plaid_access_tokens');
        if (savedTokens) {
            const tokens = JSON.parse(savedTokens);
            setAccessTokens(tokens);
        }
    }, []);

    // Save tokens and fetch balances when they change
    useEffect(() => {
        if (accessTokens.length > 0) {
            localStorage.setItem('plaid_access_tokens', JSON.stringify(accessTokens));
            fetchAllBalances(accessTokens);
        }
    }, [accessTokens]);

    const handleLinkSuccess = async (publicToken: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/exchange_public_token', {
                method: 'POST',
                body: JSON.stringify({ public_token: publicToken }),
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);

            const newToken = result.access_token;
            setAccessTokens(prev => {
                if (prev.includes(newToken)) return prev;
                return [...prev, newToken];
            });
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const fetchAllBalances = async (tokens: string[]) => {
        setLoading(true);
        setError(null);
        try {
            const fetchPromises = tokens.map(token =>
                fetch('/api/get_balances', {
                    method: 'POST',
                    body: JSON.stringify({ access_token: token }),
                    headers: { 'Content-Type': 'application/json' },
                }).then(async res => {
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    // Add institution info to each account
                    if (data.institution) {
                        setInstitutions(prev => ({
                            ...prev,
                            [token]: {
                                name: data.institution.name,
                                logo: data.institution.logo,
                            }
                        }));
                    }
                    return data.accounts.map((account: any) => ({
                        ...account,
                        access_token: token, // Add token to account for filtering later
                        institution_name: data.institution?.name,
                        institution_logo: data.institution?.logo,
                    }));
                })
            );

            const results = await Promise.all(fetchPromises);
            const combinedAccounts = results.flat();
            setAllAccounts(combinedAccounts);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveInstitution = async (token: string) => {
        if (!confirm('Are you sure you want to remove this institution? All associated accounts will be disconnected.')) return;

        setRemovingToken(token);
        setError(null);
        try {
            const response = await fetch('/api/remove_institution', {
                method: 'POST',
                body: JSON.stringify({ access_token: token }),
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);

            const newTokens = accessTokens.filter(t => t !== token);
            setAccessTokens(newTokens);
            localStorage.setItem('plaid_access_tokens', JSON.stringify(newTokens));

            setAllAccounts(prev => prev.filter(acc => acc.access_token !== token));

            setInstitutions(prev => {
                const next = { ...prev };
                delete next[token];
                return next;
            });

        } catch (err: any) {
            setError(`Failed to remove institution: ${err.message}`);
        } finally {
            setRemovingToken(null);
        }
    };

    const toggleSection = (sectionName: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionName)) {
                next.delete(sectionName);
            } else {
                next.add(sectionName);
            }
            return next;
        });
    };

    const cashAndInvestmentsBalance = allAccounts.reduce((acc, curr) => {
        if (curr.type === 'depository' || curr.type === 'investment') {
            return acc + (curr.balances.current || 0);
        }
        return acc;
    }, 0);

    const totalBalance = allAccounts.reduce((acc, curr) => {
        if (curr.type === 'other') return acc;
        const balance = curr.balances.current || 0;
        if (curr.type === 'loan' || curr.type === 'credit') {
            return acc - balance;
        }
        return acc + balance;
    }, 0);

    const sortedAccounts = [...allAccounts].sort((a, b) => {
        if (sortBy === 'institution') {
            const nameA = a.institution_name || '';
            const nameB = b.institution_name || '';
            if (nameA !== nameB) return nameA.localeCompare(nameB);

            // Secondary sort by balance (DESC)
            const balA = a.balances.current || 0;
            const balB = b.balances.current || 0;
            if (balA !== balB) return balB - balA;

            return a.name.localeCompare(b.name);
        }
        if (sortBy === 'type') {
            // Sort by type first
            const typeA = a.type || '';
            const typeB = b.type || '';
            if (typeA !== typeB) return typeA.localeCompare(typeB);

            // Then by subtype
            const subtypeA = a.subtype || '';
            const subtypeB = b.subtype || '';
            if (subtypeA !== subtypeB) return subtypeA.localeCompare(subtypeB);

            // Then by balance (DESC)
            const balA = a.balances.current || 0;
            const balB = b.balances.current || 0;
            if (balA !== balB) return balB - balA;

            const instA = a.institution_name || '';
            const instB = b.institution_name || '';
            if (instA !== instB) return instA.localeCompare(instB);

            return a.name.localeCompare(b.name);
        }
        return 0;
    });

    const groupedAccounts = sortedAccounts.reduce((acc: any, account) => {
        if (sortBy === 'institution') {
            const key = account.institution_name || 'Other Institutions';
            if (!acc[key]) acc[key] = [];
            acc[key].push(account);
        } else {
            const typeKey = account.type ? account.type.charAt(0).toUpperCase() + account.type.slice(1) : 'Other';
            const subtypeKey = account.subtype ? account.subtype.charAt(0).toUpperCase() + account.subtype.slice(1) : 'Other';

            if (!acc[typeKey]) acc[typeKey] = {};
            if (!acc[typeKey][subtypeKey]) acc[typeKey][subtypeKey] = [];
            acc[typeKey][subtypeKey].push(account);
        }
        return acc;
    }, {});

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-3xl font-thin tracking-wider text-foreground">Dashboard</h2>
                    <p className="font-thin tracking-wider text-muted-foreground">Get a clear picture of your finances.</p>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <LinkButton onSuccess={handleLinkSuccess} />
                    {accessTokens.length > 0 && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => fetchAllBalances(accessTokens)}
                            disabled={loading}
                            className="group border-none bg-secondary text-secondary-foreground hover:bg-secondary-foreground/10 transition-all duration-200"
                        >
                            <RefreshCw className={`h-4 w-4 transition-transform duration-500 group-hover:rotate-[225deg] ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <p>{error}</p>
                </div>
            )}

            {accessTokens.length === 0 && !loading && (
                <Card className="max-w-md mx-auto">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-4">
                            <Building2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-2xl text-foreground">Connect your first bank</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Link your financial accounts to see all your balances and transactions in one place.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center pb-8">
                        <LinkButton onSuccess={handleLinkSuccess} />
                    </CardContent>
                </Card>
            )}

            {allAccounts.length > 0 && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash & Investments</CardTitle>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-4 w-4 text-muted-foreground/50 hover:text-foreground cursor-help transition-colors" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Includes all checking, savings, and investment accounts.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-foreground">
                                    {formatCurrency(cashAndInvestmentsBalance)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Worth</CardTitle>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-4 w-4 text-muted-foreground/50 hover:text-foreground cursor-help transition-colors" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Calculated as (Cash + Investments) - (Credit Cards + Loans). Other account types are excluded.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-foreground">
                                    {formatCurrency(totalBalance)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Linked Institutions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-foreground">{accessTokens.length}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Active Accounts</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-foreground">{allAccounts.length}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">Linked Institutions</h3>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(institutions)
                                .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                                .map(([token, info]) => (
                                    <Card key={token}>
                                        <div className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {info.logo ? (
                                                    <div className="w-10 h-10 flex items-center justify-center">
                                                        <img
                                                            src={`data:image/png;base64,${info.logo}`}
                                                            alt={info.name}
                                                            className="max-w-full max-h-full object-contain"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <span className="font-medium text-foreground">{info.name}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveInstitution(token)}
                                                disabled={removingToken === token}
                                                className="text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                                            >
                                                {removingToken === token ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h3 className="text-lg font-semibold text-foreground">Accounts</h3>
                            <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
                                <span className="text-xs text-muted-foreground px-2 font-medium uppercase tracking-wider">Group by:</span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSortBy('institution')}
                                        className={`h-7 px-3 text-xs rounded-md transition-all ${sortBy === 'institution'
                                            ? 'bg-background text-foreground font-semibold border'
                                            : 'text-muted-foreground hover:text-foreground border border-transparent'
                                            }`}
                                    >
                                        Institution
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSortBy('type')}
                                        className={`h-7 px-3 text-xs rounded-md transition-all ${sortBy === 'type'
                                            ? 'bg-background text-foreground font-semibold border'
                                            : 'text-muted-foreground hover:text-foreground border border-transparent'
                                            }`}
                                    >
                                        Account Type
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            {Object.entries(groupedAccounts).map(([groupName, groupData]: [string, any]) => {
                                const isCollapsed = collapsedSections.has(groupName);
                                const isNested = sortBy === 'type';
                                const totalAccounts = isNested
                                    ? Object.values(groupData).reduce((sum: number, sub: any) => sum + sub.length, 0)
                                    : groupData.length;

                                return (
                                    <div key={groupName} className="space-y-6">
                                        <button
                                            onClick={() => toggleSection(groupName)}
                                            className="flex items-center gap-4 w-full group/header focus:outline-none"
                                        >
                                            <div className="flex items-center gap-2">
                                                {isCollapsed ? (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover/header:text-foreground transition-colors" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground group-hover/header:text-foreground transition-colors" />
                                                )}
                                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider group-hover/header:text-foreground transition-colors">
                                                    {groupName === 'Depository' ? 'Cash & Checking' : groupName}
                                                    <span className="ml-2 text-[10px] font-normal lowercase tracking-normal opacity-60">
                                                        ({totalAccounts} {totalAccounts === 1 ? 'account' : 'accounts'})
                                                    </span>
                                                </h4>
                                            </div>
                                            <div className="h-[1px] flex-1 bg-border group-hover/header:bg-muted-foreground/30 transition-colors"></div>
                                        </button>

                                        {!isCollapsed && (
                                            <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
                                                {isNested ? (
                                                    Object.entries(groupData).map(([subtypeName, accounts]: [string, any]) => {
                                                        const subSectionKey = `${groupName}:${subtypeName}`;
                                                        const isSubCollapsed = collapsedSections.has(subSectionKey);
                                                        return (
                                                            <div key={subtypeName} className="space-y-4 ml-6">
                                                                <button
                                                                    onClick={() => toggleSection(subSectionKey)}
                                                                    className="flex items-center gap-3 w-full group/sub focus:outline-none"
                                                                >
                                                                    <div className="h-px bg-muted-foreground/20 group-hover/sub:bg-muted-foreground/40 transition-colors"></div>
                                                                    {isSubCollapsed ? (
                                                                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover/sub:text-foreground transition-colors" />
                                                                    ) : (
                                                                        <ChevronDown className="h-3 w-3 text-muted-foreground/40 group-hover/sub:text-foreground transition-colors" />
                                                                    )}
                                                                    <h5 className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest group-hover/sub:text-foreground transition-colors">
                                                                        {subtypeName}
                                                                        <span className="ml-2 font-normal lowercase tracking-normal opacity-60">
                                                                            ({accounts.length})
                                                                        </span>
                                                                    </h5>
                                                                    <div className="h-px flex-1 bg-muted-foreground/10 group-hover/sub:bg-muted-foreground/20 transition-colors"></div>
                                                                </button>
                                                                {!isSubCollapsed && (
                                                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                        {accounts.map((account: any, idx: number) => (
                                                                            <AccountCard 
                                                                                key={`${account.account_id}-${idx}`} 
                                                                                account={account} 
                                                                                onClick={() => setSelectedAccountId(account.account_id)}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                                        {groupData.map((account: any, idx: number) => (
                                                            <AccountCard 
                                                                key={`${account.account_id}-${idx}`} 
                                                                account={account} 
                                                                onClick={() => setSelectedAccountId(account.account_id)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {loading && allAccounts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-neutral-600" />
                    <p className="text-neutral-500 animate-pulse">Fetching account data...</p>
                </div>
            )}

            <AccountDetailsModal
                isOpen={!!selectedAccountId}
                onClose={() => setSelectedAccountId(null)}
                accountId={selectedAccountId}
                accessTokens={accessTokens}
                institutionName={selectedAccount?.institution_name}
                institutionLogo={selectedAccount?.institution_logo}
            />
        </div>
    );
}
