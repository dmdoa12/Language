import { getRelic } from '../../core/relics';
import { SHOP_HEAL_AMOUNT, SHOP_HEAL_PRICE, SHOP_RELIC_PRICE, shopRelicOffer } from '../../core/run';
import { getCard } from '../../store/cards';
import { useGameStore } from '../../store/game';
import { RunHud } from '../components/RunHud';

export function Shop() {
  const g = useGameStore();
  const run = g.run!;
  const offers = g.shopOffers();
  const relicId = run.currentNodeId ? shopRelicOffer(run, run.currentNodeId) : null;
  const relic = relicId ? getRelic(relicId) : undefined;

  return (
    <div className="screen shop">
      <RunHud run={run} />
      <h2>상점</h2>
      <section className="shop-section">
        <h3>새 표현 (무료)</h3>
        {offers.length === 0 ? (
          <p className="muted">오늘 배울 수 있는 새 표현을 다 배웠어요.</p>
        ) : (
          <ul className="offer-list">
            {offers.map((id) => {
              const card = getCard(id);
              return (
                <li key={id}>
                  <button type="button" className="offer" onClick={() => void g.buyCard(id)}>
                    <span className="offer-ko">{card.ko}</span>
                    <span className="offer-situation">{card.situation}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="shop-section">
        <h3>물건</h3>
        {relic && !run.relicIds.includes(relic.id) ? (
          <button
            type="button"
            className="secondary"
            disabled={run.gold < SHOP_RELIC_PRICE}
            onClick={() => void g.buyShopRelic(relic.id)}
          >
            {relic.name} ({SHOP_RELIC_PRICE}골드) · {relic.description}
          </button>
        ) : null}
        <button
          type="button"
          className="secondary"
          disabled={run.gold < SHOP_HEAL_PRICE || run.hp >= run.maxHp}
          onClick={() => void g.buyShopHeal()}
        >
          주먹밥 ({SHOP_HEAL_PRICE}골드) · 체력 +{SHOP_HEAL_AMOUNT}
        </button>
      </section>
      <button type="button" className="primary" onClick={() => void g.leaveShop()}>
        상점 나가기
      </button>
    </div>
  );
}
