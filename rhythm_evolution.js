this.stateClip = {}
this.targetClip = {}
this.stateID = "id 0"
this.targetID = "id 0"
this.output_id = "id 0"
this.evolveCount = 0
this.originalStateLength = 0
this.numMutations = 1
this.evolutionMode = "forward"

this.inlets = 2
this.outlets = 2

this.evolutionModes = {
    "forward": 0,
    "backward": 1,
    "random": 2
}

function create_random_clip(id) {

    if (this.targetID == "id 0"){
        post("no target clip set yet")
        return false
    }
    if (id != 0) {
        post("id is " + this.targetID)
        var targetClip = read_clip(this.targetID)
        post("targetclip is " + JSON.stringify(targetClip))

        var api = new LiveAPI(this.targetID)
        var targetLength = api.get("length")
        var targetName = api.get("name")

        // shuffle the notes
        // targetClip.notes

        for (var i=0;i<targetClip.notes.length;i++){
            targetClip.notes[i].start_time = Math.random() * targetLength
            delete targetClip.notes[i]["note_id"]
        }
        delete targetClip["cn"]

        // optionally quantize
        var randomClipAPI = create_clip("id " + id, targetLength, "randomized_" + targetName)
        // randomize notes
        randomClipAPI.call("add_new_notes", targetClip)
        randomClipAPI.call("quantize", "7",0.95)
    }
    else{
        post("no clipslot selected yet")
    }
}

function set_target_id(id) {
    if (id != 0) {
        this.targetID = "id " + id
    }
}

function set_state_id(id) {
    if (id != 0) {
        this.stateID = "id " + id
    }
}

function set_evolution_mode(mode) {
    this.evolutionMode = mode
    post("evolution mode set to " + mode)
}

function set_output_id(id) {
    if (id != 0) {
        this.output_id = "id " + id
    }
}

function read_clip(id) {
    if (id != "id 0") {
        var clipAPI = new LiveAPI(id);
        var clip = read_notes(clipAPI, 0, 9999)
        outlet(0, [1, clip.notes.length]);
        return clip
    }
    else{
        post("error reading clip with id = " + id)
    }
}

function read_notes(api, regionStart, regionEnd) {
    var notes_raw = api.call("get_notes_extended", 0, 127, regionStart, regionEnd)
    var notes = JSON.parse(notes_raw)
    return notes
}


function clean_notes_obj(notesObj){
    
    delete notesObj["cn"];
    // remove the id from the state and target notes
    for (var i = 0; i < notesObj.notes.length; i++) {
        delete notesObj.notes[i]["note_id"]
    }
    return notesObj
}

function evolve_fully() {

    // read target and state
    this.targetClip = read_clip(this.targetID)
    this.stateClip = read_clip(this.stateID)
    
    var stateAPI = new LiveAPI(this.stateID);
    var targetAPI = new LiveAPI(this.targetID);
    this.originalStateLength = Number(stateAPI.get("length"))
    // var statePath = stateAPI.path
    post("\n\n\n doing a CHEKCKKK before BIATHCH \n\n")

    // test if clips are valid
    if (check_clips_valid(targetAPI, stateAPI) == false) {
        post("\n clips did not pass tests\n")
        return false
    }   

    // get all state information and notes
    var stateNotes = read_notes(stateAPI, 0, stateAPI.get("length"))

    stateNotes = clean_notes_obj(stateNotes)
    this.targetClip = clean_notes_obj(this.targetClip) // TODO: don't make this an instance variable

    // post("targetnotes length is " + this.targetClip.notes.length)
    // shortestLength is for the notes during evolutionSteps. the rest is handled after
    var shortestLength = Math.min(Number(stateNotes.notes.length), Number(this.targetClip.notes.length))

    // make list for note order
    var noteOrder = []
    for (var i=0;i<shortestLength;i++){
        noteOrder.push(i)
    }
    // modify based on evolutionMode
    if (this.evolutionMode == this.evolutionModes["backward"]){
        noteOrder.reverse()
    }
    // modify based on evolutionMode
    if (this.evolutionMode == this.evolutionModes["random"]){
        noteOrder = shuffleArray(noteOrder)
    }
   
    // post("shortestLength is " + shortestLength + " . NOTE ORDER IS " + noteOrder)

    // make output track
    var mutationName = Object.keys(this.evolutionModes).find(key => this.evolutionModes[key] === this.evolutionMode)
    var outputName = "evolved_" + stateAPI.get("name") + "_" + this.numMutations + "_" + mutationName
    var outputAPI = create_clip(this.output_id, stateAPI.get("length"), outputName)

    // fill the outputCLIP with the current state notes
    outputAPI.call("add_new_notes", stateNotes)

    // start evolution
    var numEvolveSteps = Math.floor(shortestLength / this.numMutations) + 1

    // check if notes make sense
    var noteOverflow = stateClip.notes.length - this.targetClip.notes.length
    // if noteOverflow > 0, we have too many stateNotes
    // if noteOverflow < 0, we have too few stateNotes
    
    // get how often a note is added/removed
    // 3 overflow, and 3 rounds --> 1 per round
    // 3 overflow, and 6 rounds --> 0.5 per round, or every 2 rounds
    // 3 overflow, and 10 rounds --> 3/10 per round, or every 3 rounds
    // 7 overflow, and 5 rounds --> 7/5 per round, or every 3 rounds

    // add ceil(overflow/rounds) new note every round until done
    // if (overflow<0): remove ceil(abs(overflow/rounds)) new note every round until done
    // if (overflow>0): add ceil(overflow/rounds) new note every round until done

    this.evolveCount = 0
    // start evolution
    post("evolving for " + numEvolveSteps + " times")
    for (var i = 0; i < numEvolveSteps; i++) {
        post("step")
        evolve_step(outputAPI, stateNotes, noteOrder, shortestLength)
    }

    this.evolveCount= shortestLength
    
    // we have too many state notes!
    if (noteOverflow > 0){
        post("\n dealwithstateoverflow!! \n")
        dealWithStateOverflow(stateNotes, outputAPI, numMutations, noteOverflow)
    }
    // we have too few state notes!
    if (noteOverflow < 0){
        post("\n dealwithstateunderflow!! \n")
        dealWithStateUnderflow(stateNotes, outputAPI, numMutations, Math.abs(noteOverflow))
    }

    // algorithm as follows:
    // do the least number of evolve steps, which means set n state notes to the n target notes. 
    // at the ending, when stateOverflow, remove stateNotes at the end of noteOrder. 
    //   - make it depend on numMutations
    // 
    // at the ending, when -stateOverflow, so when there are not enough state_notes, add new targetNotes directly from the targetClip.
    //   - make it depend on numMutations

}


function evolve_step(outputAPI, stateNotes, noteOrder, shortestLength) {
    /*
    evolves the stateNotes: swaps one state-note for a target-note
    */

    post("evolve step")
    outlet(1, "evolve step");

    // get output length befor extension
    var outputStartingPoint = Number(outputAPI.get("length"))

    // extend the output clip by adding the original statelength
    extendClip(outputAPI)

    // mutate stateNotes
    for (var i = 0; i < this.numMutations; i++) {
        if (i >= shortestLength){
            push("\n broken out of the looop i > shortestlength")
            break
        }
        // get target notes
        var trgtNote = this.targetClip.notes[noteOrder[this.evolveCount]]
        stateNotes.notes[noteOrder[this.evolveCount]] = JSON.parse(JSON.stringify(trgtNote))
        // increment count
        this.evolveCount = (this.evolveCount + 1) % shortestLength
        if (this.evolveCount == 0){
            post("\n\n EVOLVECOUNT IS 0 \n\n")
        }
    }

    writeStateToOutput(stateNotes, outputStartingPoint, outputAPI)
}

function writeStateToOutput(stateNotes, outputStartingPoint, outputAPI){
    /*
    make a copy of the stateNotes and set it to the right timing for the outputClip
    */

    var StateNotesCopy = JSON.parse(JSON.stringify(stateNotes));
    delete StateNotesCopy['cn']

    // post("\n statenotes len is " + stateNotes.notes.length + " statenotescopy len is " + StateNotesCopy.notes.length)
    // post("\n statenotescopy is " + JSON.stringify(StateNotesCopy))

    for (var i = 0; i < stateNotes.notes.length; i++) {
        // get target notes
        StateNotesCopy.notes[i].start_time += outputStartingPoint //Number(regionEnd)
    }

    // add new notes
    outputAPI.call("add_new_notes", StateNotesCopy)
}

function dealWithStateOverflow(stateNotes, outputAPI, numMutations, noteOverflow){
    /*
    adds more alterations when there are more state notes than target notes
    */

    var removeCount = 0
    post("NOTE OVERFLOW IS " + noteOverflow)
    var startLength = stateNotes.notes.length
    // remove all the excess notes from the stateClip
    loop1:
        for (var i=this.evolveCount; i < startLength;i++){

            var outputStartingPoint = Number(outputAPI.get("length"))
            extendClip(outputAPI)

            for (var j=0;j<numMutations;j++){
                // remove notes from the stateClip
                // stateNotes.notes.splice(this.evolveCount, 1)
                stateNotes.notes.pop()
                removeCount+=1

                if (removeCount == noteOverflow){
                    writeStateToOutput(stateNotes, outputStartingPoint, outputAPI)
                    break loop1
                }
            }
            writeStateToOutput(stateNotes, outputStartingPoint, outputAPI)
        }
}

function dealWithStateUnderflow(stateNotes, outputAPI, numMutations, noteOverflow){
    /*
    adds more alterations when there are more TARGET notes than STATE notes
    */
    var addedNotes = 0
    loop1:
        for (var i=this.evolveCount; i < this.targetClip.notes.length;i++){
            var outputStartingPoint = Number(outputAPI.get("length"))
            extendClip(outputAPI)
            for (var j=0;j<numMutations;j++){
                // add notes from the targetClip
                stateNotes.notes.push(this.targetClip.notes[this.evolveCount+addedNotes])
                addedNotes+=1

                if (addedNotes == noteOverflow){
                    writeStateToOutput(stateNotes, outputStartingPoint, outputAPI)
                    break loop1
                }
            }

            writeStateToOutput(stateNotes, outputStartingPoint, outputAPI)
        }
}

function set_n_mutations(numMutations) {
    this.numMutations = numMutations
    post("numm mutations is " + this.numMutations)
}

function create_clip(id, clipLength, clipName) {

    post("creating clip with id " + id + " and length " + clipLength)
    var api = new LiveAPI(id)

    // first check if clip already exists. If it does, delete it
    if (api.get("has_clip") == 1) {
        api.call("delete_clip")
        post("deleted existing clip")
    }

    api.call("create_clip", clipLength)
    var apiPath = String(api.path)
    var newClipPath = apiPath.substring(1, apiPath.length - 1) + " clip" //api.path + " clip"
    post("create clip path is: " + newClipPath)

    var newClipAPI = new LiveAPI(newClipPath)
    newClipAPI.set("name", clipName)

    return newClipAPI
}

function extendClip(api) {
    /**
     * extends the clip with the original statelength.
     */

    var clipLength = Number(api.get("length"))
    // api.call("duplicate_region", clipLength-this.originalStateLength,this.originalStateLength,clipLength)
    api.set("loop_end", clipLength + this.originalStateLength)
    post("\n new endpoint is " + (clipLength + this.originalStateLength))
}

function check_clips_valid(targetAPI, stateAPI) {
    // check if both clips are filled
    var clipsFilled = this.stateClip != {} && this.targetClip != {}
    if (!clipsFilled) {
        outlet(1, "target and state must both be initialized");
        post("test failed: target and state must both be initialized")
        return false
    }

    // check if both clips have a notes key
    if (!("notes" in this.stateClip) || !("notes" in this.targetClip)) {
        outlet(1, "target or state don't have notes key yet");
        post("test failed: target or state don't have notes key yet")
        return false
    }
    post("\n\n\n doing a CHEKCKKK BIATHCH \n\n")
    // check if both clips have the same length
    if (stateAPI.get("length") != targetAPI.get("length")) {
        outlet(1, "target and state clip should have the same length");
        post("test failed: target and state clip should have the same length")
        return false
    }

    // https://docs.cycling74.com/max8/vignettes/live_object_model
    // // check if both clips have the same length
    // var sameNoteCount = this.stateClip.notes.length == this.targetClip.notes.length
    // if (!sameNoteCount) {
    //     post("target and state must have same note count")
    //     outlet(1, "target and state must have same note count");
    //     return false
    // }
}


function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array
}
