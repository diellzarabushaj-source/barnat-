'use strict';

/* Full cap-safety gate: legacy applicability + PRN + bounded schedule ranges. */
require('./pediatric-cap-applicability-core-test.js');
require('./pediatric-prn-safety-test.js');
require('./pediatric-faringobloc-94-test.js');
require('./pediatric-schedule-range-test.js');
