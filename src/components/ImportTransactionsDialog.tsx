'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Upload, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ImportedTransaction {
  date: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
}

interface ImportTransactionsDialogProps {
  onImport: (accountName: string, institutionName: string, transactions: ImportedTransaction[]) => void;
}

export default function ImportTransactionsDialog({ onImport }: ImportTransactionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setAccountName('');
    setInstitutionName('');
    setFile(null);
    setError(null);
    setLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.toLowerCase();
      if (ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please select a CSV or XLSX file');
        setFile(null);
      }
    }
  };

  const validateTransactions = (data: any[]): ImportedTransaction[] => {
    const requiredColumns = ['date', 'name', 'category', 'amount', 'currency'];
    
    if (data.length === 0) {
      throw new Error('File is empty');
    }

    // Check if all required columns exist (case-insensitive)
    const firstRow = data[0];
    const keys = Object.keys(firstRow).map(k => k.toLowerCase());
    const missingColumns = requiredColumns.filter(col => !keys.includes(col));
    
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // Normalize and validate data
    const transactions: ImportedTransaction[] = data.map((row, index) => {
      const normalizedRow: any = {};
      Object.keys(row).forEach(key => {
        normalizedRow[key.toLowerCase()] = row[key];
      });

      const date = normalizedRow.date?.toString().trim();
      const name = normalizedRow.name?.toString().trim();
      const category = normalizedRow.category?.toString().trim();
      const amountStr = normalizedRow.amount?.toString().trim();
      const currency = normalizedRow.currency?.toString().trim();

      if (!date || !name || !category || !amountStr || !currency) {
        throw new Error(`Row ${index + 2}: Missing required data`);
      }

      // Parse amount
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        throw new Error(`Row ${index + 2}: Invalid amount value`);
      }

      // Validate date format
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Row ${index + 2}: Invalid date format`);
      }

      return {
        date,
        name,
        category,
        amount,
        currency,
      };
    });

    return transactions;
  };

  const parseCSV = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
          } else {
            resolve(results.data);
          }
        },
        error: (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        },
      });
    });
  };

  const parseXLSX = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Failed to parse XLSX file'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleImport = async () => {
    if (!accountName.trim()) {
      setError('Please enter an account name');
      return;
    }

    if (!institutionName.trim()) {
      setError('Please enter an institution name');
      return;
    }

    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let parsedData: any[];
      
      if (file.name.toLowerCase().endsWith('.csv')) {
        parsedData = await parseCSV(file);
      } else {
        parsedData = await parseXLSX(file);
      }

      const transactions = validateTransactions(parsedData);

      if (transactions.length === 0) {
        throw new Error('No valid transactions found in file');
      }

      onImport(accountName.trim(), institutionName.trim(), transactions);
      setOpen(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to import transactions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Import Transactions
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Transactions</DialogTitle>
          <DialogDescription>
            Import transactions from a CSV or XLSX file. File must include: Date, Name, Category, Amount, Currency
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="accountName">Account Name</Label>
            <Input
              id="accountName"
              placeholder="e.g. My Checking Account"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="institutionName">Institution Name</Label>
            <Input
              id="institutionName"
              placeholder="e.g. RBC Royal Bank"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="file">Transaction File</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="cursor-pointer file:cursor-pointer file:mr-4"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                Selected: {file.name}
              </p>
            )}
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
