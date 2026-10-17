qs.manual(true);
await qs.start({ seed: 11, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 99);
await qs.advance(1);
await shot('aim-center');
return { crush: qs.state().crushId, seat: qs.ctx.cast.seatOf(qs.state().crushId) };
