import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';
import { Products, CountryCode } from 'plaid';

export async function POST() {
    try {
        const productsRaw = (process.env.PLAID_PRODUCTS || 'transactions')
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0 && p !== 'balance');

        // Use transactions as the primary product, and others as optional if supported
        const products = (productsRaw.includes('transactions') ? ['transactions'] : [productsRaw[0] || 'transactions']) as Products[];
        const optionalProducts = productsRaw.filter(p => !products.includes(p as Products)) as Products[];

        const countryCodes = (process.env.PLAID_COUNTRY_CODES || 'US,CA')
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c.length > 0) as CountryCode[];

        const configs: any = {
            user: {
                client_user_id: 'money-app-user-unique-id', // Unique ID representing your user
            },
            client_name: 'Money App',
            products: products,
            country_codes: countryCodes,
            language: 'en',
        };

        if (optionalProducts.length > 0) {
            configs.required_if_supported_products = optionalProducts;
        }

        const createTokenResponse = await plaidClient.linkTokenCreate(configs);
        return NextResponse.json(createTokenResponse.data);
    } catch (error: any) {
        console.error('Error creating link token:', error.response?.data || error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
