#!/bin/sh
# Regenerate endings1..3.js from _template.js
cd "$(dirname "$0")"
gen() { node -e "const fs=require('fs');fs.writeFileSync('$1', fs.readFileSync('_template.js','utf8').replace('__CASES__', process.argv[1]))" "$2"; }
gen pt1.js "[
 {expect:'love_bonk', target:'crush', forceSynthetic: true, synthetic: { type: 'floor', bonk: 'crush' }, shotFinal: false},
 {expect:'passed_around', target:'tang_tang', shotFinal: false},
 {expect:'perfect', target:'crush', shotFinal: false},
 {expect:'wrong_accept', target:'xu_ruoqing', forceSynthetic: true, synthetic: { type: 'floor', nearOf: 'xu_ruoqing' }, extraBeat: 'react', shotFinal: false},
 {expect:'same_gender', target:'wang_dazhuang', forceSynthetic: true, synthetic: { type: 'floor', bonk: 'wang_dazhuang' }, extraBeat: 'react', shotFinal: false},
]"
gen pt2.js "[
 {expect:'wrong_caught', target:'lin_xiaoyu', shotFinal: false},
 {expect:'caught_read', mode:'caught', shotFinal: false},
 {expect:'chalk_counter', target:'teacher', shotFinal: false},
 {expect:'graded', target:'podium', shotFinal: false},
 {expect:'three_pointer', target:'trash', shotFinal: false},
]"
gen pt3.js "[
 {expect:'out_window', target:'window', shotFinal: false},
 {expect:'confetti', target:'fan', opts: { budgetMs: 400 }, synthetic: { type: 'fan', fanId: 'f0' }, shotFinal: false},
 {expect:'self_love', target:'self', shotFinal: false},
 {expect:'lost', target:'floor', shotFinal: false},
 {expect:'coward', mode:'timeout', roundSeconds: 2, shotFinal: false},
]"
