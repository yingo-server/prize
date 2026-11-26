use wasm_bindgen::prelude::*;

/// GPU 信息探测：返回 WebGL 渲染器字符串（JS 侧把 canvas 传进来拿参数）
#[wasm_bindgen]
pub fn gpu_renderer(vendor: &str, renderer: &str) -> String {
    format!("{} | {}", vendor, renderer)
}

/// 32 位安全随机数生成器（供抽奖种子使用），返回 i32 数组
#[wasm_bindgen]
pub fn random_words(n: usize) -> Vec<i32> {
    let mut out = Vec::with_capacity(n);
    // xorshift 双状态，由 JS Date.now + performance.now 播种（seed_with）
    unsafe {
        for _ in 0..n {
            let mut x = S0;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            S0 = x;
            out.push(x as i32);
        }
    }
    out
}

static mut S0: u32 = 0x9E3779B9;

#[wasm_bindgen]
pub fn seed_with(s: u32) {
    unsafe {
        S0 = if s == 0 { 0x9E3779B9 } else { s };
    }
}

/// 粒子物理步进：批量更新 x,y,vx,vy（重力+阻尼），返回打包 Float32Array 更省内存
/// data: [x,y,vx,vy,life] * n
#[wasm_bindgen]
pub fn particle_step(data: &mut [f32], dt: f32, gravity: f32, drag: f32) {
    let n = data.len() / 5;
    for i in 0..n {
        let o = i * 5;
        data[o + 2] *= drag;
        data[o + 3] = data[o + 3] * drag + gravity * dt;
        data[o] += data[o + 2] * dt;
        data[o + 1] += data[o + 3] * dt;
        data[o + 4] -= dt;
    }
}
