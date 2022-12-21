// maxmsp params
outlets = 6
inlets = 2

// algorithm params
var num_agents = 20
var stepsize = 0.002
var updateBeta = 1.0;
this.initialized = false

function initialize() {

    this.initialized = true

    this.rogue_phase = 0.0
    this.freeze_mode = false;

    this.op3m = new JitterObject("jit.3m");

    this.stepcount = 0;

    this.noisegen = new JitterObject("jit.noise")
    this.noisegen.dim = num_agents
    this.noisegen.planecount = 1
    this.noisegen.type = "float32"

    // output matrix
    this.out_matrix = new JitterMatrix(1, "float32", num_agents)
    this.out_matrix.setall(0)

    // phases matrix
    this.phases = new JitterMatrix(1, "float32", num_agents)
    this.noisegen.matrixcalc(this.phases, this.phases)
    // omega matrix
    this.omegas = new JitterMatrix(1, "float32", num_agents)
    this.noisegen.matrixcalc(this.omegas, this.omegas)
    this.omegas.op("*", 2)
    this.omegas.op("+", 1)

    this.omegasUpdate = new JitterMatrix(1, "float32", num_agents)

    // flashed matrix
    this.flashed = new JitterMatrix(1, "float32", num_agents)
    this.flashed.setall(0)

    // stepdelta matrix
    this.timedeltas = new JitterMatrix(1, "float32", num_agents)
    this.timedeltas.setall(stepsize)
    this.timedeltas.op("/", this.timedeltas, this.omegas)

    // for integrating the flashes
    this.gPlus = new JitterMatrix(1, "float32", num_agents)
    this.gMin = new JitterMatrix(1, "float32", num_agents)

    this.gPlusExp = new JitterObject("jit.expr")
    this.gMinExp = new JitterObject("jit.expr")
    this.omegaUpdate = new JitterObject("jit.expr")

    this.pooepsilonpoo = new JitterMatrix(1, "float32", num_agents)
    this.pooepsilonpoo.setall(0.01)
    this.omegaCommon = new JitterMatrix(1, "float32", num_agents)
    this.omegaCommon.setall(2)

    this.omegaLow = new JitterMatrix(1, "float32", num_agents)
    this.omegaLow.setall(0.8)

    this.omegaHigha = new JitterMatrix(1, "float32", num_agents)
    this.omegaHigha.setall(3.0)

    // for visualization
    this.delta_phases = new JitterMatrix(1, "float32", num_agents)
    this.omegaMean = 2;

    outlet(0, "jit_matrix", this.phases.name)
    outlet(1, "jit_matrix", this.omegas.name)
    outlet(2, "jit_matrix", this.timedeltas.name)
    outlet(4, "sync")
}


function integrate_flash(strength) {

    gPlusExp.expr = "max(sin(2 * 3.14159265359 * in[0]) / (2 * 3.14159265359), 0)"
    gPlusExp.matrixcalc([this.phases], this.gPlus)

    gMinExp.expr = "-1 * min( sin(2 * 3.14159265359 * in[0]) / (2 * 3.14159265359), 0)"
    gMinExp.matrixcalc([this.phases], this.gMin)

    omegaUpdate.expr = "in[1] * (in[2] - in[0]) + in[3] * in[7] * (in[5] - in[0]) + in[4] * in[7] * (in[6] - in[0])"
    omegaUpdate.matrixcalc([this.omegas, this.pooepsilonpoo, this.omegaCommon, this.gPlus, this.gMin, this.omegaLow, this.omegaHigha, this.phases], this.omegasUpdate)

    omegasUpdate.op("*", this.updateBeta);
    omegasUpdate.op("*", strength);
    this.omegas.op("+", omegasUpdate);

    this.timedeltas.setall(this.stepsize)
    
    if (this.freeze_mode){
        // make timedeltas the same for all
        this.timedeltas.op("/", this.omegaMean)
    }
    
    else
    {
        this.timedeltas.op("/", this.omegas)
    }    
}


function un_sync() {

    // unsync works by blocking omegas from updating.
    this.updateBeta = 0;
    this.freeze_mode = false;

    // outlet(4, this.updateBeta)
    outlet(4, "unsync")
}

function freeze_sync() {

    // freeze_sync makes all timedeltas the same, so each phase change will not happen anymore
    this.updateBeta = 0;
    this.freeze_mode = true;

    // get the mean of the omegas
    var op3m_omega = new JitterObject("jit.3m");
    op3m_omega.matrixcalc(this.omegas, this.omegas);

    this.omegaMean = op3m_omega.mean;

    // outlet(4, this.updateBeta)
    outlet(4, "freeze")
}

function continue_sync() {

    this.updateBeta = 1
    this.freeze_mode = false;

    // outlet(4, this.updateBeta)
    outlet(4, "sync")
}


function adjust_omega_common(freq) {

    this.omegaCommon.setall(freq);
    var spread = freq / 2;
    var low = max(0.01, freq-spread);
	post(low)
    var high = min(10, freq+spread);
    this.omegaHigha.setall(high);
    this.omegaLow.setall(low);
    // this.omegaHigha.setall(freq)
}

function adjust_epsilon(newEpsilon) {

    this.pooepsilonpoo.setall(newEpsilon)
}


function msg_int(r) {
    // here we change the number of agents
    this.num_agents = r
    initialize()
}



function msg_float(r) {
    // here we change the stepsize
    this.stepsize = r
}



function bang(b) {
    // here we change the stepsize

    if (!initialized){
        initialize();
    }


    post("gotbannged")

    integrate_flash(20);

}

function step() {

    stepcount += 1;
    // do one timestep
    this.phases.op("+", this.timedeltas)

    // check if flashed
    this.flashed.op("floor", this.phases)
    this.out_matrix.op("+", this.flashed)
    this.out_matrix.op("-", 0.04)
    this.out_matrix.op('max', 0)

    // convert phases to out
    outlet(0, stepcount)
    outlet(1, "jit_matrix", this.phases.name)
    outlet(2, "jit_matrix", this.out_matrix.name)

    var base_phase = this.phases.getcell(0)
    delta_phases.op("-", this.phases, base_phase)
    // delta_phases.op("abs", delta_phases)

    this.op3m.matrixcalc(this.flashed, this.flashed);

    if (op3m.mean > 0) {
        integrate_flash(1.0)
        outlet(3, "bang") // TODO: replace by number 
        outlet(5, "jit_matrix", this.flashed.name)
        this.phases.op("%", 1)
    }
}