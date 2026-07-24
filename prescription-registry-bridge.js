(() => {
  'use strict';

  const Core = window.MedIndexPrescriptionFormat;
  if (!Core || Core.__registryNotationReady) return;

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const originalNormalizeDrug = Core.normalizeDrug.bind(Core);
  const originalSelectedDrugLine = Core.selectedDrugLine.bind(Core);

  Core.normalizeDrug = item => {
    const normalized = originalNormalizeDrug(item);
    return {
      ...normalized,
      packaging:text(item?.packaging || item?.packageSize),
      packagingSummary:text(item?.packagingSummary),
      prescriptionLine:text(item?.prescriptionLine),
      prescriptionNotation:text(item?.prescriptionNotation),
      sheetPrescriptionNotation:text(item?.sheetPrescriptionNotation),
      dispense:text(item?.dispense || normalized.dispense),
    };
  };

  Core.selectedDrugLine = item => {
    const drug = Core.normalizeDrug(item);
    return drug.prescriptionLine || originalSelectedDrugLine(drug);
  };

  Core.__registryNotationReady = true;
})();
