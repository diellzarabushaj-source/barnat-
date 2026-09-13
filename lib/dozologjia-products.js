'use strict';
/*
 * Dozologjia — the formulation shelf.
 *
 * Master v2.7 binds an exact, source-audited product to some regimens and
 * converts mg to mL itself. For everything else the clinician still has to
 * turn a dose in mg into something measurable: how many mg a tablet holds, how
 * many mg the syrup holds per how many mL.
 *
 * These are the strengths commonly found on the shelf. They are NOT read off a
 * verified label, so every entry carries marketTypical:true and the page says
 * so: it is a starting point to save typing, and the bottle is the authority.
 * The clinician can always enter their own strength instead, and that is what
 * gets remembered for the drug.
 */

const solid = (id, form, mg) => ({ id, kind:'solid', form, mg, label:`${String(mg).replace('.', ',')} mg`, marketTypical:true });
const liquid = (id, mg, mL) => ({ id, kind:'liquid', mg, mL, label:`${String(mg).replace('.', ',')} mg / ${String(mL).replace('.', ',')} mL`, marketTypical:true });

const TEMPLATES = {
  D012:[ // Diclofenac — rectal
    solid('diclofenac-supp-12.5','supozitor',12.5),
    solid('diclofenac-supp-25','supozitor',25),
    solid('diclofenac-supp-50','supozitor',50),
    solid('diclofenac-supp-100','supozitor',100),
  ],
  D014:[ // Tramadol — ampoules
    liquid('tramadol-50-1',50,1),
    liquid('tramadol-100-2',100,2),
  ],
  D016:[ // Paracetamol — oral
    liquid('paracetamol-120-5',120,5),
    liquid('paracetamol-125-5',125,5),
    liquid('paracetamol-160-5',160,5),
    liquid('paracetamol-250-5',250,5),
    solid('paracetamol-tab-500','tabletë',500),
  ],
  D017:[ // Ibuprofen — oral
    liquid('ibuprofen-100-5',100,5),
    liquid('ibuprofen-200-5',200,5),
    solid('ibuprofen-tab-200','tabletë',200),
    solid('ibuprofen-tab-400','tabletë',400),
  ],
  D019:[ // Metoclopramide — ampoule
    liquid('metoclopramide-10-2',10,2),
  ],
  D022:[ // Ondansetron — ampoules
    liquid('ondansetron-4-2',4,2),
    liquid('ondansetron-8-4',8,4),
  ],
  D023:[ // Furosemide — ampoules
    liquid('furosemide-20-2',20,2),
    liquid('furosemide-40-4',40,4),
  ],
  D031:[ // Amoxicillin — oral
    liquid('amoxicillin-125-5',125,5),
    liquid('amoxicillin-250-5',250,5),
    solid('amoxicillin-cap-250','kapsulë',250),
    solid('amoxicillin-cap-500','kapsulë',500),
  ],
  D034:[ // Azithromycin — oral
    liquid('azithromycin-200-5',200,5),
    solid('azithromycin-tab-250','tabletë',250),
    solid('azithromycin-tab-500','tabletë',500),
  ],
  D037:[ // Cefuroxime axetil — oral
    liquid('cefuroxime-125-5',125,5),
    liquid('cefuroxime-250-5',250,5),
    solid('cefuroxime-tab-125','tabletë',125),
    solid('cefuroxime-tab-250','tabletë',250),
    solid('cefuroxime-tab-500','tabletë',500),
  ],
  D045:[ // Pyridoxine — oral
    solid('pyridoxine-tab-20','tabletë',20),
    solid('pyridoxine-tab-50','tabletë',50),
  ],
};

/* Cefuroxime axetil is the one where swapping shapes is a clinical error, not
   just an inconvenience, so the shelf repeats the source's own warning. */
const CAUTIONS = {
  D037:'Tableta dhe suspensioni i cefuroxime axetil nuk zëvendësohen mg për mg — mbaj formën që ke zgjedhur.',
};

module.exports = { TEMPLATES, CAUTIONS };
