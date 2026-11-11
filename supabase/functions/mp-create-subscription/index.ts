/**
 * POST /functions/v1/mp-create-subscription   (requer usuário logado)
 * Corpo opcional: { "plan": "mensal", "payer_email": "e-mail da conta Mercado Pago" }
 *
 * Cria (ou reaproveita) a assinatura local "pending" e a assinatura
 * (preapproval) no Mercado Pago, devolvendo o link de pagamento.
 * NÃO ativa nada: a ativação só ocorre após consulta à API (webhook/sync).
 */
import { adminClient, logEvent, rateLimited, userFromRequest } from '../_shared/db.ts'
import { errorMessage, json, preflight, providerBusy, requireEnv, tooManyRequests } from '../_shared/http.ts'
import { billingToMp, firstChargeAmount, introActive } from '../_shared/mapping.ts'
import { MercadoPago, MercadoPagoError } from '../_shared/mercadopago.ts'

const REUSE_PENDING_HOURS = 24

/**
 * O Mercado Pago só aceita back_url pública em https. Em desenvolvimento
 * (SITE_URL http://localhost), usa a função mp-return como intermediária.
 */
function backUrl(siteUrl: string): string {
  if (siteUrl.startsWith('https://')) return `${siteUrl}/pagamento/retorno`
  return `${requireEnv('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/mp-return`
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return json({ error: 'Faça login para assinar.' }, 401)
  if (!user.email_confirmed_at) return json({ error: 'Confirme seu e-mail antes de assinar.' }, 403)
  // Cada tentativa cria uma assinatura no Mercado Pago: até 5 a cada 10 minutos
  if (await rateLimited(admin, `mp-create:${user.id}`, 5, 600)) return tooManyRequests()

  let createdSubId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    const planCode = typeof body?.plan === 'string' ? body.plan : 'mensal'
    // O Mercado Pago exige que o pagador entre no checkout com a conta deste e-mail
    const informed = typeof body?.payer_email === 'string' ? body.payer_email.trim().toLowerCase() : ''
    if (informed && (informed.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(informed)))
      return json({ error: 'Informe um e-mail válido da sua conta Mercado Pago.' }, 400)

    const { data: plan } = await admin
      .from('plans')
      .select('id, code, name, price, currency, billing_period, intro_price, intro_until, intro_label')
      .eq('code', planCode)
      .eq('is_active', true)
      .maybeSingle()
    if (!plan) return json({ error: 'Plano indisponível.' }, 404)

    const { data: subs } = await admin
      .from('subscriptions')
      .select('id, status, checkout_url, external_subscription_id, created_at, plan_id, agreed_amount')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending', 'paused'])
      .order('created_at', { ascending: false })

    if (subs?.some((s) => s.status === 'active')) return json({ error: 'Você já possui uma assinatura ativa.' }, 409)

    // Preço promocional (Black Friday): quem assina no período paga o valor da promoção em TODAS as cobranças
    // (preço garantido enquanto mantiver a assinatura); fora do período, o preço normal do plano
    const promo = introActive(plan)
    const amount = firstChargeAmount(plan)
    const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')

    // Reaproveita um link de pagamento recente para não criar assinaturas duplicadas (só se o valor ainda for o mesmo)
    const recent = subs?.find(
      (s) =>
        s.status === 'pending' &&
        s.plan_id === plan.id &&
        s.checkout_url &&
        Math.round(Number(s.agreed_amount ?? plan.price) * 100) === Math.round(amount * 100) &&
        Date.now() - new Date(s.created_at).getTime() < REUSE_PENDING_HOURS * 3600_000,
    )
    if (recent && !informed) return json({ checkout_url: recent.checkout_url, subscription_id: recent.id, reused: true })

    // Uma nova tentativa substitui assinaturas pendentes anteriores (evita links duplicados)
    for (const old of subs?.filter((x) => x.status === 'pending') ?? []) {
      if (old.external_subscription_id) {
        await MercadoPago.updatePreapproval(old.external_subscription_id, { status: 'cancelled' }).catch(() => null)
      }
      await admin.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', old.id)
    }

    const { data: sub, error: insErr } = await admin
      .from('subscriptions')
      .insert({ user_id: user.id, plan_id: plan.id, provider: 'mercadopago', status: 'pending', agreed_amount: amount, intro_pending: false })
      .select('id')
      .single()
    if (insErr || !sub) throw new Error(`não foi possível criar a assinatura local: ${insErr?.message}`)
    createdSubId = sub.id

    const siteUrl = requireEnv('SITE_URL').replace(/\/+$/, '')
    // Em teste, o pagador é sempre a conta compradora de teste
    const payerEmail = Deno.env.get('MERCADO_PAGO_TEST_PAYER_EMAIL') || informed || user.email

    const preapproval = await MercadoPago.createPreapproval(
      {
        reason: promo
          ? `${plan.name} — AtualidadeAI Concursos (${plan.intro_label ?? 'promoção'}: ${brl(amount)}/mês garantido)`
          : `${plan.name} — AtualidadeAI Concursos`,
        external_reference: sub.id,
        payer_email: payerEmail,
        auto_recurring: {
          ...billingToMp(plan.billing_period),
          transaction_amount: amount,
          currency_id: plan.currency,
        },
        back_url: backUrl(siteUrl),
        status: 'pending',
      },
      sub.id,
    )

    createdSubId = null // já vinculada ao Mercado Pago: manter
    const checkoutUrl = preapproval.init_point ?? preapproval.sandbox_init_point ?? null
    await admin
      .from('subscriptions')
      .update({ external_subscription_id: preapproval.id, provider_status: preapproval.status, checkout_url: checkoutUrl })
      .eq('id', sub.id)

    await logEvent(admin, {
      source: 'checkout',
      topic: 'preapproval',
      action: 'create',
      resource_id: preapproval.id,
      status: 'processed',
    })

    if (!checkoutUrl) return json({ error: 'O Mercado Pago não retornou o link de pagamento.' }, 502)
    return json({ checkout_url: checkoutUrl, subscription_id: sub.id })
  } catch (e) {
    const msg = errorMessage(e)
    // Remove a assinatura local criada nesta tentativa se o Mercado Pago falhou
    if (createdSubId) await admin.from('subscriptions').delete().eq('id', createdSubId).eq('status', 'pending')
    await logEvent(admin, { source: 'checkout', topic: 'preapproval', action: 'create', status: 'failed', error: msg })
    console.error('[mp-create-subscription]', msg)
    if (e instanceof MercadoPagoError && e.status === 429) return providerBusy()
    const status = e instanceof MercadoPagoError && e.status < 500 ? 400 : 502
    return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente em instantes.' }, status)
  }
})
