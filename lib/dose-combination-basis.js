'use strict';

function clean(value) {
  return String(value ?? '').trim();
}

function resolveDoseBasis(product = {}, rule = {}) {
  const ingredients = Array.isArray(product.ingredients) ? product.ingredients : [];
  const ingredientIds = new Set(ingredients.map(item => clean(item?.conceptId || item?.concept_id)).filter(Boolean));
  const mode = clean(rule.doseBasisMode || rule.dose_basis_mode || (ingredients.length <= 1 ? 'single_active' : ''));
  const componentConceptId = clean(rule.doseBasisComponentConceptId || rule.dose_basis_component_concept_id);
  const sourceExplicit = rule.doseBasisExplicitInSource === true || rule.dose_basis_explicit_in_source === true;

  if (ingredients.length <= 1) {
    if (!['single_active','component'].includes(mode || 'single_active')) {
      return { valid:false, reason:'single_product_basis_invalid', mode, componentConceptId:'' };
    }
    return {
      valid:true,
      reason:'single_active_unambiguous',
      mode:'single_active',
      componentConceptId:componentConceptId || [...ingredientIds][0] || '',
    };
  }

  if (!mode) return { valid:false, reason:'combination_basis_missing', mode:'', componentConceptId:'' };

  if (mode === 'component') {
    if (!componentConceptId) return { valid:false, reason:'combination_component_missing', mode, componentConceptId:'' };
    if (!ingredientIds.has(componentConceptId)) return { valid:false, reason:'combination_component_not_present', mode, componentConceptId };
    if (!sourceExplicit) return { valid:false, reason:'combination_component_not_explicit_in_source', mode, componentConceptId };
    return { valid:true, reason:'explicit_component_basis', mode, componentConceptId };
  }

  if (mode === 'combined_total') {
    if (!sourceExplicit) return { valid:false, reason:'combined_total_not_explicit_in_source', mode, componentConceptId:'' };
    return { valid:true, reason:'explicit_combined_total_basis', mode, componentConceptId:'' };
  }

  if (mode === 'manual') return { valid:false, reason:'manual_combination_basis', mode, componentConceptId };

  return { valid:false, reason:'combination_basis_invalid', mode, componentConceptId };
}

module.exports = { resolveDoseBasis };
