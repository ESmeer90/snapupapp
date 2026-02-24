import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createListing, getCategories } from '@/lib/api';
import type { Category } from '@/types';
import { SA_PROVINCES } from '@/types';
import {
  Upload, FileSpreadsheet, Download, X, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, Eye, Trash2, AlertCircle, FileText
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface BulkCSVImportProps {
  categories: Category[];
  onClose: () => void;
  onImportComplete: () => void;
}

interface CSVRow {
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  location: string;
  province: string;
  is_negotiable?: string;
}

interface ParsedRow {
  index: number;
  raw: CSVRow;
  errors: string[];
  warnings: string[];
  resolved: {
    title: string;
    description: string;
    price: number;
    category_id: string | null;
    category_name: string;
    condition: string;
    location: string;
    province: string;
    is_negotiable: boolean;
  } | null;
}

const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'];
const CONDITION_MAP: Record<string, string> = {
  'new': 'new',
  'brand new': 'new',
  'like new': 'like_new',
  'like_new': 'like_new',
  'good': 'good',
  'fair': 'fair',
  'poor': 'poor',
};

function parseCSV(text: string): CSVRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.every(v => !v.trim())) continue; // skip empty rows

    const row: any = {};
    header.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push({
      title: row.title || '',
      description: row.description || '',
      price: row.price || '',
      category: row.category || '',
      condition: row.condition || '',
      location: row.location || '',
      province: row.province || '',
      is_negotiable: row.is_negotiable || row.negotiable || '',
    });
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const BulkCSVImport: React.FC<BulkCSVImportProps> = ({ categories, onClose, onImportComplete }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [importComplete, setImportComplete] = useState(false);
  const [fileName, setFileName] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  const validateAndParse = useCallback((rawRows: CSVRow[]): ParsedRow[] => {
    return rawRows.map((raw, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Title
      if (!raw.title || raw.title.length < 3) errors.push('Title must be at least 3 characters');
      if (raw.title.length > 100) errors.push('Title must be under 100 characters');

      // Description
      if (!raw.description || raw.description.length < 10) errors.push('Description must be at least 10 characters');

      // Price
      const priceNum = parseFloat(raw.price.replace(/[^0-9.]/g, ''));
      if (isNaN(priceNum) || priceNum <= 0) errors.push('Price must be a positive number');
      if (priceNum > 10000000) errors.push('Price seems too high');

      // Category
      let categoryId: string | null = null;
      let categoryName = 'None';
      if (raw.category) {
        const match = categories.find(c =>
          c.name.toLowerCase() === raw.category.toLowerCase() ||
          c.slug.toLowerCase() === raw.category.toLowerCase()
        );
        if (match) {
          categoryId = match.id;
          categoryName = match.name;
        } else {
          warnings.push(`Category "${raw.category}" not found, will be set to none`);
        }
      }

      // Condition
      const condNormalized = CONDITION_MAP[raw.condition.toLowerCase()] || '';
      if (!condNormalized) {
        if (raw.condition) {
          warnings.push(`Condition "${raw.condition}" not recognized, defaulting to "good"`);
        }
      }

      // Location
      if (!raw.location || raw.location.length < 2) errors.push('Location is required');

      // Province
      const provinceMatch = SA_PROVINCES.find(p =>
        p.toLowerCase() === raw.province.toLowerCase() ||
        p.toLowerCase().replace(/[- ]/g, '') === raw.province.toLowerCase().replace(/[- ]/g, '')
      );
      if (!provinceMatch) {
        if (raw.province) {
          errors.push(`Province "${raw.province}" is not valid`);
        } else {
          errors.push('Province is required');
        }
      }

      // Negotiable
      const isNeg = ['yes', 'true', '1', 'y'].includes((raw.is_negotiable || '').toLowerCase());

      const resolved = errors.length === 0 ? {
        title: raw.title.trim(),
        description: raw.description.trim(),
        price: priceNum,
        category_id: categoryId,
        category_name: categoryName,
        condition: condNormalized || 'good',
        location: raw.location.trim(),
        province: provinceMatch || 'Gauteng',
        is_negotiable: isNeg,
      } : null;

      return { index: index + 1, raw, errors, warnings, resolved };
    });
  }, [categories]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      toast({ title: 'Invalid file', description: 'Please upload a CSV file', variant: 'destructive' });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rawRows = parseCSV(text);
      if (rawRows.length === 0) {
        toast({ title: 'Empty file', description: 'No data rows found in the CSV file', variant: 'destructive' });
        return;
      }
      if (rawRows.length > 100) {
        toast({ title: 'Too many rows', description: 'Maximum 100 listings per import. Please split your file.', variant: 'destructive' });
        return;
      }
      const parsed = validateAndParse(rawRows);
      setParsedRows(parsed);
      setImportComplete(false);
    };
    reader.readAsText(file);
  }, [validateAndParse]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = () => {
    const header = 'title,description,price,category,condition,location,province,is_negotiable';
    const example1 = '"iPhone 14 Pro Max 256GB","Excellent condition iPhone 14 Pro Max, Space Black, 256GB. Includes original box and charger.",15999,electronics,like_new,Sandton,Gauteng,yes';
    const example2 = '"Wooden Dining Table","Beautiful solid oak dining table, seats 6. Minor scratches on surface.",4500,furniture,good,Cape Town,Western Cape,yes';
    const example3 = '"Nike Air Max 90","Brand new Nike Air Max 90, size 10 UK. Never worn, still in box.",2200,fashion,new,Durban,KwaZulu-Natal,no';
    const csv = [header, example1, example2, example3].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'snapup_listing_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = parsedRows.filter(r => r.resolved !== null);
  const errorRows = parsedRows.filter(r => r.errors.length > 0);
  const warningRows = parsedRows.filter(r => r.warnings.length > 0 && r.errors.length === 0);

  const removeRow = (index: number) => {
    setParsedRows(prev => prev.filter(r => r.index !== index));
  };

  const handleImport = async () => {
    if (!user || validRows.length === 0) return;
    setImporting(true);
    setImportProgress({ current: 0, total: validRows.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      if (!row.resolved) continue;

      setImportProgress({ current: i + 1, total: validRows.length, success, failed });

      try {
        await createListing({
          title: row.resolved.title,
          description: row.resolved.description,
          price: row.resolved.price,
          category_id: row.resolved.category_id,
          condition: row.resolved.condition,
          location: row.resolved.location,
          province: row.resolved.province,
          images: [],
          is_negotiable: row.resolved.is_negotiable,
          user_id: user.id,
        });
        success++;
      } catch (err) {
        failed++;
      }
    }

    setImportProgress({ current: validRows.length, total: validRows.length, success, failed });
    setImporting(false);
    setImportComplete(true);

    if (failed === 0) {
      toast({ title: 'Import Complete', description: `Successfully created ${success} listing${success !== 1 ? 's' : ''}.` });
    } else {
      toast({
        title: 'Import Partially Complete',
        description: `${success} created, ${failed} failed.`,
        variant: 'destructive',
      });
    }
    onImportComplete();
  };

  const progressPct = importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4 sm:my-8 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Bulk Import Listings</h2>
              <p className="text-xs text-gray-500">Upload a CSV file to create multiple listings at once</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Template Download */}
          <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">Download CSV Template</p>
                <p className="text-xs text-blue-600">Pre-formatted with example data and all required columns</p>
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 transition-all"
            >
              <Download className="w-4 h-4" /> Download
            </button>
          </div>

          {/* Column Info */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Required CSV Columns</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { name: 'title', desc: 'Listing title' },
                { name: 'description', desc: 'Full description' },
                { name: 'price', desc: 'Price in ZAR' },
                { name: 'category', desc: 'Category name/slug' },
                { name: 'condition', desc: 'new, like_new, good, fair, poor' },
                { name: 'location', desc: 'City/area name' },
                { name: 'province', desc: 'SA province' },
                { name: 'is_negotiable', desc: 'yes/no (optional)' },
              ].map(col => (
                <div key={col.name} className="p-2 bg-white rounded-lg border border-gray-100">
                  <p className="text-xs font-mono font-semibold text-gray-800">{col.name}</p>
                  <p className="text-[10px] text-gray-500">{col.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upload Area */}
          {parsedRows.length === 0 && !importComplete && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-300'}`} />
              <p className="text-lg font-semibold text-gray-700 mb-1">
                {isDragOver ? 'Drop your CSV file here' : 'Drag & drop your CSV file'}
              </p>
              <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
              <p className="text-xs text-gray-400">Maximum 100 listings per import</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && !importComplete && (
            <>
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl">
                  <FileSpreadsheet className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">{fileName}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" /> {validRows.length} valid
                  </span>
                  {errorRows.length > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="w-4 h-4" /> {errorRows.length} errors
                    </span>
                  )}
                  {warningRows.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-4 h-4" /> {warningRows.length} warnings
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setParsedRows([]); setFileName(''); }}
                  className="ml-auto text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 transition-all"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              </div>

              {/* Toggle Preview */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'Hide' : 'Show'} Preview
                {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPreview && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-8">#</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Title</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Price</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Category</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Condition</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Location</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Province</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsedRows.map((row) => {
                          const hasError = row.errors.length > 0;
                          const hasWarning = row.warnings.length > 0;
                          return (
                            <tr
                              key={row.index}
                              className={`${
                                hasError ? 'bg-red-50/50' : hasWarning ? 'bg-amber-50/50' : 'hover:bg-gray-50'
                              } transition-colors`}
                            >
                              <td className="px-3 py-2 text-xs text-gray-400">{row.index}</td>
                              <td className="px-3 py-2">
                                {hasError ? (
                                  <div className="group relative">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded-full">
                                      <AlertCircle className="w-3 h-3" /> Error
                                    </span>
                                    <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block w-60 p-2 bg-red-50 border border-red-200 rounded-lg shadow-lg">
                                      {row.errors.map((e, i) => (
                                        <p key={i} className="text-[10px] text-red-700">{e}</p>
                                      ))}
                                    </div>
                                  </div>
                                ) : hasWarning ? (
                                  <div className="group relative">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full">
                                      <AlertTriangle className="w-3 h-3" /> Warn
                                    </span>
                                    <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block w-60 p-2 bg-amber-50 border border-amber-200 rounded-lg shadow-lg">
                                      {row.warnings.map((w, i) => (
                                        <p key={i} className="text-[10px] text-amber-700">{w}</p>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" /> Valid
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-gray-900 max-w-[150px] truncate">{row.raw.title}</td>
                              <td className="px-3 py-2 text-xs font-semibold text-gray-700">
                                {row.resolved ? `R${row.resolved.price.toLocaleString()}` : row.raw.price}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {row.resolved?.category_name || row.raw.category || '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {row.resolved?.condition || row.raw.condition || '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600 max-w-[100px] truncate">{row.raw.location}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">{row.resolved?.province || row.raw.province}</td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => removeRow(row.index)}
                                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-all"
                                  title="Remove row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Progress */}
              {importing && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      <span className="text-sm font-medium text-blue-700">
                        Importing listings... {importProgress.current}/{importProgress.total}
                      </span>
                    </div>
                    <span className="text-xs text-blue-500">
                      {importProgress.success} created, {importProgress.failed} failed
                    </span>
                  </div>
                  <div className="w-full h-3 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-blue-500 mt-1 text-center">{Math.round(progressPct)}% complete</p>
                </div>
              )}
            </>
          )}

          {/* Import Complete */}
          {importComplete && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Import Complete</h3>
              <p className="text-sm text-gray-500 mb-1">
                {importProgress.success} listing{importProgress.success !== 1 ? 's' : ''} created successfully
              </p>
              {importProgress.failed > 0 && (
                <p className="text-sm text-red-500">
                  {importProgress.failed} listing{importProgress.failed !== 1 ? 's' : ''} failed to import
                </p>
              )}
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => { setParsedRows([]); setFileName(''); setImportComplete(false); }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                >
                  Import More
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {parsedRows.length > 0 && !importComplete && (
          <div className="p-6 border-t border-gray-100 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-500">
              {validRows.length} of {parsedRows.length} rows ready to import
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={importing}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-200"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Import {validRows.length} Listing{validRows.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkCSVImport;
