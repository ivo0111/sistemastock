import { useState, useEffect } from 'react'
import { get, post } from '../../api/client'

export default function Caja() {
  const [caja, setCaja] = useState(null)
  const [loading, setLoading] = useState(true)
  const [montoInicial, setMontoInicial] = useState('')
  const [montoFinal, setMontoFinal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  function load() {
    setLoading(true)
    get('/caja/actual')
      .then(setCaja)
      .catch(() => setCaja({ abierta: false }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleApertura(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await post('/caja/apertura', { montoInicial: Number(montoInicial) })
      setMontoInicial('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCierre(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await post('/caja/cierre', { montoFinalContado: Number(montoFinal) })
      setResultado({
        esperado: res.montoFinalEsperado,
        contado: res.montoFinalContado,
        diferencia: res.diferencia,
      })
      setMontoFinal('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="grid-2">
        {caja?.abierta? (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Caja Abierta</span>
              <span className="badge badge-success">Abierta</span>
            </div>
            <div className="grid-2">
              <div className="stat-card">
                <div className="stat-label">Apertura</div>
                <div className="stat-value" style={{ fontSize: 18 }}>${Number(montoInicial).toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Actual</div>
                <div className="stat-value" style={{ fontSize: 18 }}>${Number(caja.total_actual || 0).toFixed(2)}</div>
              </div>
            </div>
            <div className="text-sm text-gray" style={{ margin: '8px 0 16px' }}>
              Abierta: {new Date(caja.fecha_apertura).toLocaleString('es-AR')}
            </div>

            <h4 style={{ marginBottom: 8 }}>Cerrar Caja</h4>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCierre}>
              <div className="form-group">
                <label>Monto final contado en caja</label>
                <input className="form-control" type="number" step="0.01" value={montoFinal} onChange={e => setMontoFinal(e.target.value)} required />
              </div>
              <button className="btn btn-warning" disabled={saving}>{saving ? 'Cerrando...' : 'Cerrar Caja'}</button>
            </form>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Caja Cerrada</span>
              <span className="badge badge-danger">Cerrada</span>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleApertura}>
              <div className="form-group">
                <label>Monto inicial</label>
                <input className="form-control" type="number" step="0.01" value={montoInicial} onChange={e => setMontoInicial(e.target.value)} required />
              </div>
              <button className="btn btn-success" disabled={saving}>{saving ? 'Abriendo...' : 'Abrir Caja'}</button>
            </form>
          </div>
        )}

        {resultado && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Resultado del Cierre</span>
            </div>
            <div className="grid-3" style={{ marginTop: 8 }}>
              <div className="stat-card">
                <div className="stat-label">Esperado</div>
                <div className="stat-value" style={{ fontSize: 16 }}>${Number(resultado.esperado || 0).toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Contado</div>
                <div className="stat-value" style={{ fontSize: 16 }}>${Number(resultado.contado || 0).toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Diferencia</div>
                <div className="stat-value" style={{ fontSize: 16, color: Number(resultado.diferencia) < 0 ? 'var(--danger)' : Number(resultado.diferencia) > 0 ? 'var(--success)' : 'inherit' }}>
                  ${Number(resultado.diferencia || 0).toFixed(2)}
                </div>
              </div>
            </div>
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setResultado(null)}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}