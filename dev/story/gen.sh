#!/bin/sh
# Regenerate endings1..3.js from _template.js
cd "$(dirname "$0")"
gen() { node -e "const fs=require('fs');fs.writeFileSync('$1', fs.readFileSync('_template.js','utf8').replace('__CASES__', process.argv[1]))" "$2"; }
gen endings1.js "[
 {expect:'perfect', target:'crush'},
 {expect:'same_gender', target:'wang_dazhuang'},
 {expect:'wrong_caught', target:'lin_xiaoyu'},
 {expect:'wrong_accept', target:'xu_ruoqing'},
 {expect:'caught_read', mode:'caught'},
]"
gen endings2.js "[
 {expect:'chalk_counter', target:'teacher'},
 {expect:'graded', target:'podium'},
 {expect:'three_pointer', target:'trash'},
 {expect:'out_window', target:'window'},
]"
gen endings3.js "[
 {expect:'confetti', target:'fan', opts: { budgetMs: 400 }, synthetic: { type: 'fan', fanId: 'f0' }},
 {expect:'self_love', target:'self'},
 {expect:'lost', target:'floor'},
 {expect:'coward', mode:'timeout', roundSeconds: 2},
]"
gen endings4.js "[
 {expect:'confetti', target:'fan', opts: { budgetMs: 400 }, synthetic: { type: 'fan', fanId: 'f0' }},
 {expect:'three_pointer', target:'trash'},
]"
gen endings5.js "[
 {expect:'same_gender', target:'wang_dazhuang'},
 {expect:'self_love', target:'self'},
 {expect:'lost', target:'floor'},
 {expect:'graded', target:'podium'},
]"
gen fix1.js "[
 {expect:'perfect', target:'crush', shotFinal: false},
 {expect:'same_gender', target:'wang_dazhuang', extraBeat: 'reaction', shotFinal: false},
 {expect:'self_love', target:'self', extraBeat: 'reaction', shotFinal: false},
 {expect:'confetti', target:'fan', opts: { budgetMs: 400 }, synthetic: { type: 'fan', fanId: 'f0' }},
 {expect:'caught_read', mode:'caught', shotFinal: false},
]"
