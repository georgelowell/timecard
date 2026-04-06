import { adminDb } from './firebase-admin';
import { Category, JobFunction, TaxonomyNode } from '@/types';

export async function getTaxonomyTree(): Promise<TaxonomyNode[]> {
  const [categoriesSnap, functionsSnap] = await Promise.all([
    adminDb.collection('categories').where('active', '==', true).orderBy('order').get(),
    adminDb.collection('functions').where('active', '==', true).orderBy('order').get(),
  ]);

  const categories = categoriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
  const functions = functionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as JobFunction));

  return categories.map(cat => ({
    ...cat,
    functions: functions.filter(fn => fn.categoryId === cat.id),
  }));
}
