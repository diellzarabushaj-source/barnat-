'use strict';

const Core = require('./dose-core.js');
const Adjust = require('./dose-adjustment-engine.js');

const VERSION = 'drx-dose-runtime-engine-v1';

function clean(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  return value === true || clean(value).toLowerCase() === 'true';
}

function rowsFor(rule, domain) {
  const key = domain === 'renal' ? 'renalAdjustments' : 'hepaticAdjustments';
  const snake = domain === 'renal' ? 'renal_adjustments' : 'hepatic_adjustments';
  const rows = rule?.[key] ?? rule?.[snake];
  return Array.isArray(rows) ? rows : [];
}

function requiredFor(rule, domain) {
  if (domain === 'renal') return bool(rule?.renalAdjustmentRequired ?? rule?.renal_adjustment_required);
  return bool(rule?.hepaticAdjustmentRequired ?? rule?.hepatic_adjustment_required);
}

function structuredInputState(rows, patient = {}) {
  const measures = [...new Set(rows.map(row => Adjust.normalizeMeasure(row.measureType ?? row.measure_type)).filter(Boolean))];
  const available = measures.filter(measure => {
    const value = Adjust.patientMeasure(patient, measure);
    return value !== null && value !== '';
  });
  return { measures, available, missingAll:measures.length > 0 && available.length === 0 };
}

function selectDomain(rule, patient, domain) {
  const required = requiredFor(rule, domain);
  const rows = rowsFor(rule, domain);

  if (!required) {
    return { domain, required:false, status:'not-required', action:'none', rows:0 };
  }

  if (!rows.length) {
    return {
      domain,
      required:true,
      status:'blocked',
      reason:domain + '_adjustment_evidence_missing',
      action:'none',
      rows:0,
    };
  }

  const input = structuredInputState(rows, patient);
  if (input.missingAll) {
    return {
      domain,
      required:true,
      status:'needs-input',
      reason:domain + '_structured_input_missing',
      action:'none',
      rows:rows.length,
      requiredMeasures:input.measures,
    };
  }

  const selection = Adjust.selectAdjustment(rows, patient, { failOnInvalid:true });
  if (selection.status === 'matched') {
    return {
      domain,
      required:true,
      status:'matched',
      reason:selection.reason,
      action:selection.adjustment?.doseAction || 'none',
      rows:rows.length,
      requiredMeasures:input.measures,
      selection,
    };
  }

  return {
    domain,
    required:true,
    status:selection.status === 'no_match' ? 'blocked' : selection.status,
    reason:selection.reason || (domain + '_adjustment_not_resolved'),
    action:selection.adjustment?.doseAction || 'none',
    rows:rows.length,
    requiredMeasures:input.measures,
    selection,
  };
}

function changingAction(action) {
  return ['reduce_dose','extend_interval'].includes(String(action || ''));
}

function clearAdjustmentFlag(rule, domain) {
  const next = { ...rule };
  const removeKey = domain === 'renal' ? 'renal_function' : 'hepatic_function';
  if (domain === 'renal') {
    next.renalAdjustmentRequired = false;
    next.renal_adjustment_required = false;
  } else {
    next.hepaticAdjustmentRequired = false;
    next.hepatic_adjustment_required = false;
  }
  for (const key of ['requiredInputs','required_inputs']) {
    if (Array.isArray(next[key])) next[key] = next[key].filter(item => clean(item) !== removeKey);
  }
  return next;
}

function applySelected(rule, selected) {
  if (!selected?.required || selected.status === 'not-required') return { status:'unchanged', rule:{...rule} };
  if (selected.status !== 'matched') return { status:'blocked', reason:selected.reason, rule:null };

  const applied = Adjust.applyAdjustment(rule, selected.selection);
  if (applied.status !== 'applied') return applied;
  return {
    ...applied,
    rule:clearAdjustmentFlag(applied.rule, selected.domain),
  };
}

function calculate(rule = {}, patient = {}, product = null) {
  const renal = selectDomain(rule, patient, 'renal');
  const hepatic = selectDomain(rule, patient, 'hepatic');
  const selections = [renal, hepatic];

  const needsInput = selections.filter(item => item.status === 'needs-input');
  if (needsInput.length) {
    return {
      schemaVersion:VERSION,
      outcome:Core.OUTCOME.NEEDS_INPUT,
      ruleKey:String(rule.ruleKey ?? rule.rule_key ?? ''),
      missing:[...new Set(needsInput.flatMap(item => item.requiredMeasures || []))],
      adjustmentSelections:selections,
      reason:'structured_adjustment_input_required',
    };
  }

  const blocked = selections.filter(item => item.status === 'blocked');
  if (blocked.length) {
    return {
      schemaVersion:VERSION,
      outcome:Core.OUTCOME.MANUAL_REVIEW,
      ruleKey:String(rule.ruleKey ?? rule.rule_key ?? ''),
      reasons:blocked.map(item => item.reason),
      adjustmentSelections:selections,
    };
  }

  const doseChanging = selections.filter(item => item.status === 'matched' && changingAction(item.action));
  if (doseChanging.length > 1) {
    return {
      schemaVersion:VERSION,
      outcome:Core.OUTCOME.MANUAL_REVIEW,
      ruleKey:String(rule.ruleKey ?? rule.rule_key ?? ''),
      reasons:['multiple_dose_changing_adjustments_require_manual_review'],
      adjustmentSelections:selections,
    };
  }

  let adjustedRule = { ...rule };
  const appliedAdjustments = [];

  for (const selected of selections) {
    if (selected.status !== 'matched') continue;
    const applied = applySelected(adjustedRule, selected);
    if (applied.status !== 'applied') {
      return {
        schemaVersion:VERSION,
        outcome:Core.OUTCOME.MANUAL_REVIEW,
        ruleKey:String(rule.ruleKey ?? rule.rule_key ?? ''),
        reasons:[applied.reason || 'adjustment_application_failed'],
        adjustmentSelections:selections,
      };
    }
    adjustedRule = applied.rule;
    appliedAdjustments.push({
      domain:selected.domain,
      action:selected.action,
      adjustment:selected.selection.adjustment,
    });
  }

  const core = Core.calculate(adjustedRule, patient, product);
  return {
    ...core,
    schemaVersion:VERSION,
    coreSchemaVersion:Core.VERSION,
    originalRuleKey:String(rule.ruleKey ?? rule.rule_key ?? ''),
    adjustedRule,
    adjustmentSelections:selections,
    appliedAdjustments,
  };
}

module.exports = {
  VERSION,
  calculate,
  _test:{
    clean,
    bool,
    rowsFor,
    requiredFor,
    structuredInputState,
    selectDomain,
    changingAction,
    clearAdjustmentFlag,
    applySelected,
  },
};
