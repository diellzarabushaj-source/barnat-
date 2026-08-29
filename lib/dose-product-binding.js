'use strict';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function productIngredients(product) {
  return (Array.isArray(product?.ingredients) ? product.ingredients : [])
    .map(item => ({
      conceptId:clean(item?.conceptId || item?.concept_id),
      canonicalKey:clean(item?.canonicalKey || item?.canonical_key),
      canonicalName:clean(item?.canonicalName || item?.canonical_name),
    }))
    .filter(item => item.conceptId || item.canonicalKey);
}

function groupCovers(productGroup, ruleGroup) {
  const p = clean(productGroup);
  const r = clean(ruleGroup);
  if (!r || !p) return true;
  if (p === 'pediatric_and_adult') return ['pediatric_only','adult_only','pediatric_and_adult'].includes(r);
  return p === r;
}

function ingredientMatch(rule, ingredients) {
  const conceptId = clean(rule?.substanceConceptId || rule?.substance_concept_id);
  const key = clean(rule?.substanceKey || rule?.substance_key || rule?.activeSubstance || rule?.active_substance);
  if (conceptId) {
    const hit = ingredients.find(item => item.conceptId === conceptId);
    return hit ? { matched:true, method:'concept_id_exact', ingredient:hit } : { matched:false, method:'concept_id_exact', ingredient:null };
  }
  if (key) {
    const n = norm(key);
    const hit = ingredients.find(item => norm(item.canonicalKey || item.canonicalName) === n);
    return hit ? { matched:true, method:'canonical_key_exact', ingredient:hit } : { matched:false, method:'canonical_key_exact', ingredient:null };
  }
  return { matched:false, method:'identity_missing', ingredient:null };
}

function bindRuleToProduct(rule = {}, product = {}) {
  const errors = [];
  const ingredients = productIngredients(product);
  const ingredient = ingredientMatch(rule, ingredients);

  if (!clean(product.productKey || product.product_key)) errors.push('product_key_missing');
  if (!clean(rule.ruleKey || rule.rule_key)) errors.push('rule_key_missing');
  if (!ingredients.length) errors.push('product_ingredients_missing');
  if (!ingredient.matched) errors.push('substance_identity_mismatch');

  const ruleRoute = clean(rule.route);
  const productRoute = clean(product.route);
  if (ruleRoute && productRoute && norm(ruleRoute) !== norm(productRoute)) errors.push('route_mismatch');

  const ruleForm = clean(rule.pharmaceuticalForm || rule.pharmaceutical_form);
  const productForm = clean(product.pharmaceuticalForm || product.pharmaceutical_form);
  if (ruleForm && productForm && norm(ruleForm) !== norm(productForm)) errors.push('formulation_mismatch');

  if (!groupCovers(product.patientGroup || product.patient_group, rule.patientGroup || rule.patient_group)) {
    errors.push('patient_group_mismatch');
  }

  const combination = ingredients.length > 1;
  const doseBasisComponent = clean(rule.doseBasisComponentConceptId || rule.dose_basis_component_concept_id);
  if (combination && !doseBasisComponent) errors.push('combination_dose_basis_missing');
  if (combination && doseBasisComponent && !ingredients.some(item => item.conceptId === doseBasisComponent)) {
    errors.push('combination_dose_basis_not_in_product');
  }

  return {
    schemaVersion:'drx-dose-product-binding-v1',
    productKey:clean(product.productKey || product.product_key),
    ruleKey:clean(rule.ruleKey || rule.rule_key),
    combination,
    ingredientCount:ingredients.length,
    matchedIngredient:ingredient.ingredient,
    matchMethod:ingredient.method,
    valid:errors.length === 0,
    errors,
  };
}

module.exports = {
  clean,
  norm,
  productIngredients,
  groupCovers,
  ingredientMatch,
  bindRuleToProduct,
};
